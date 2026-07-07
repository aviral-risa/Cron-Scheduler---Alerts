/**
 * Parse IST cron fields (minute hour dom month dow) and check if job is due
 * within the current dispatch window (default 14 minutes).
 */
import { getIstMinutesSinceMidnight } from '../src/scheduler-job-state';

function getIstDayOfWeek(reference = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(reference);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function matchesDayOfWeek(dowField: string, dow: number): boolean {
  if (dowField === '*') {
    return true;
  }
  for (const part of dowField.split(',')) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((v) => parseInt(v, 10));
      if (dow >= start && dow <= end) {
        return true;
      }
    } else if (parseInt(part, 10) === dow) {
      return true;
    }
  }
  return false;
}

function parseIstCronFields(schedule: string): {
  minute: number;
  hour: number;
  dowStr: string;
} | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) {
    return null;
  }
  const [minuteStr, hourStr, , , dowStr] = parts;
  const minute = parseInt(minuteStr, 10);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) {
    return null;
  }
  return { minute, hour, dowStr };
}

/** Human-readable IST time from cron minute/hour fields (e.g. "11:00 AM"). */
export function formatIstCronScheduleTime(schedule: string): string {
  const fields = parseIstCronFields(schedule);
  if (!fields) {
    return schedule;
  }
  const { hour, minute } = fields;
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

export function isIstCronDueNow(
  schedule: string,
  reference = new Date(),
  windowMinutes = 14
): boolean {
  const fields = parseIstCronFields(schedule);
  if (!fields) {
    return false;
  }

  const { minute, hour, dowStr } = fields;
  const dow = getIstDayOfWeek(reference);
  if (!matchesDayOfWeek(dowStr, dow)) {
    return false;
  }

  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = getIstMinutesSinceMidnight(reference);
  const diff = nowMinutes - scheduledMinutes;
  return diff >= 0 && diff < windowMinutes;
}

/**
 * True when today's IST scheduled time has passed, the job matches today's DOW,
 * and it has not yet run (caller should still check completion state).
 * Used for catch-up when GHA ticks arrive late.
 */
export function isCronPastDueToday(schedule: string, reference = new Date()): boolean {
  const fields = parseIstCronFields(schedule);
  if (!fields) {
    return false;
  }

  const { minute, hour, dowStr } = fields;
  const dow = getIstDayOfWeek(reference);
  if (!matchesDayOfWeek(dowStr, dow)) {
    return false;
  }

  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = getIstMinutesSinceMidnight(reference);
  return nowMinutes >= scheduledMinutes;
}
