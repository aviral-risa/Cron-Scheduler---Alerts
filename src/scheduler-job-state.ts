import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const STATE_PATH = resolve(
  process.cwd(),
  process.env.SCHEDULER_STATE_FILE ?? '.scheduler-runs.json'
);
const FIRESTORE_COLLECTION = 'scheduler_job_state';

type RunState = Record<string, string>;

type StateBackend = 'file' | 'firestore';

function getStateBackend(): StateBackend {
  const configured = process.env.SCHEDULER_STATE_BACKEND;
  if (configured === 'firestore') {
    return 'firestore';
  }
  if (configured === 'file') {
    return 'file';
  }
  // GitHub Actions: file state + workflow cache (no Firestore permission needed)
  if (process.env.GITHUB_ACTIONS === 'true') {
    return 'file';
  }
  if (process.env.K_SERVICE || process.env.SCHEDULER_CLOUD_MODE === 'true') {
    return 'firestore';
  }
  return 'file';
}

function loadFileState(): RunState {
  if (!existsSync(STATE_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as RunState;
  } catch {
    return {};
  }
}

function saveFileState(state: RunState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function getFirestoreDb() {
  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) {
    const projectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT;
    if (!projectId) {
      throw new Error('Missing Firebase/GCP project id for scheduler state');
    }
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }
  return admin.firestore();
}

async function readFirestoreCompletedDate(jobId: string): Promise<string | null> {
  const db = await getFirestoreDb();
  const doc = await db.collection(FIRESTORE_COLLECTION).doc(jobId).get();
  if (!doc.exists) {
    return null;
  }
  const value = doc.data()?.completedDate;
  return typeof value === 'string' ? value : null;
}

async function writeFirestoreCompletedDate(jobId: string, dateKey: string): Promise<void> {
  const db = await getFirestoreDb();
  await db.collection(FIRESTORE_COLLECTION).doc(jobId).set(
    {
      completedDate: dateKey,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export function getTodayIstDateKey(reference = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference);
}

export function getYesterdayIstDateKey(reference = new Date()): string {
  const todayKey = getTodayIstDateKey(reference);
  const [year, month, day] = todayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getIstMinutesSinceMidnight(reference = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(reference);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export async function hasJobCompletedOnDate(jobId: string, dateKey: string): Promise<boolean> {
  if (getStateBackend() === 'firestore') {
    const completed = await readFirestoreCompletedDate(jobId);
    return completed === dateKey;
  }
  const state = loadFileState();
  return state[jobId] === dateKey;
}

export async function hasJobCompletedToday(jobId: string, reference = new Date()): Promise<boolean> {
  return hasJobCompletedOnDate(jobId, getTodayIstDateKey(reference));
}

export async function markJobCompletedOnDate(jobId: string, dateKey: string): Promise<void> {
  if (getStateBackend() === 'firestore') {
    await writeFirestoreCompletedDate(jobId, dateKey);
    return;
  }
  const state = loadFileState();
  state[jobId] = dateKey;
  saveFileState(state);
}

export async function markJobCompletedToday(jobId: string, reference = new Date()): Promise<void> {
  await markJobCompletedOnDate(jobId, getTodayIstDateKey(reference));
}

export async function hasCatchUpNotified(jobId: string, dateKey: string): Promise<boolean> {
  const key = `${jobId}::catchup::${dateKey}`;
  if (getStateBackend() === 'firestore') {
    const completed = await readFirestoreCompletedDate(key);
    return completed === dateKey;
  }
  const state = loadFileState();
  return state[key] === dateKey;
}

export async function markCatchUpNotified(jobId: string, dateKey: string): Promise<void> {
  const key = `${jobId}::catchup::${dateKey}`;
  await markJobCompletedOnDate(key, dateKey);
}

export interface ScheduledJobSpec {
  id: string;
  hour: number;
  minute: number;
  label: string;
}

export function isPastScheduledTimeToday(spec: ScheduledJobSpec, reference = new Date()): boolean {
  const now = getIstMinutesSinceMidnight(reference);
  return now >= spec.hour * 60 + spec.minute;
}
