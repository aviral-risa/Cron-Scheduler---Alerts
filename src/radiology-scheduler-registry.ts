import type { ScheduledJobId } from './scheduler-jobs';

/**
 * Radiology GHA schedules — one UTC cron expression per job (IST times in comments).
 * Each schedule triggers exactly one workflow run → one job. No shared dispatcher.
 */
export interface RadiologyGhaSchedule {
  id: ScheduledJobId;
  /** GitHub Actions cron (UTC) */
  utcCron: string;
  /** Human label (IST) */
  istTime: string;
  description: string;
}

export const RADIOLOGY_GHA_SCHEDULES: RadiologyGhaSchedule[] = [
  {
    id: 'astera-denial-free-days',
    utcCron: '30 22 * * *',
    istTime: '4:00 AM',
    description: 'Denial free days streak + cron health digest',
  },
  {
    id: 'astera-dashboard-sync',
    utcCron: '30 5 * * *',
    istTime: '11:00 AM',
    description: 'Dashboard Sheets sync',
  },
  {
    id: 'astera-yesterday-unworked',
    utcCron: '0 10 * * *',
    istTime: '3:30 PM',
    description: 'Yesterday assigned still unworked',
  },
  {
    id: 'astera-denial-internal',
    utcCron: '30 10 * * *',
    istTime: '4:00 PM',
    description: 'Daily denial list (internal)',
  },
  {
    id: 'astera-onco-notes-quality',
    utcCron: '45 10 * * *',
    istTime: '4:15 PM',
    description: 'OncoEMR notes quality audit (pasted + missing)',
  },
  {
    id: 'astera-assigned-unworked',
    utcCron: '30 11 * * *',
    istTime: '5:00 PM',
    description: 'Assigned unworked 2+ days',
  },
  {
    id: 'astera-query-return',
    utcCron: '45 11 * * *',
    istTime: '5:15 PM',
    description: 'Query return re-allotment',
  },
  {
    id: 'astera-wip-stale',
    utcCron: '30 16 * * *',
    istTime: '10:00 PM',
    description: 'WIP > 1 day',
  },
  {
    id: 'astera-authmate-pending',
    utcCron: '30 17 * * *',
    istTime: '11:00 PM',
    description: 'AuthMate pending missed notes',
  },
];

/** Resolve job id from GHA scheduled event cron string. */
export function resolveRadiologyJobFromUtcCron(utcCron: string): ScheduledJobId | null {
  const normalized = utcCron.trim().replace(/\s+/g, ' ');
  const entry = RADIOLOGY_GHA_SCHEDULES.find((s) => s.utcCron === normalized);
  return entry?.id ?? null;
}

export function getRadiologySchedule(jobId: ScheduledJobId): RadiologyGhaSchedule | undefined {
  return RADIOLOGY_GHA_SCHEDULES.find((s) => s.id === jobId);
}

/** @deprecated Use RADIOLOGY_GHA_SCHEDULES — kept for medonc-style registry consumers */
export interface CloudSchedulerJobDef {
  id: ScheduledJobId;
  schedule: string;
  description: string;
}

export const RADIOLOGY_SCHEDULER_JOBS: CloudSchedulerJobDef[] = RADIOLOGY_GHA_SCHEDULES.map(
  (s) => ({
    id: s.id,
    schedule: utcCronToIstCron(s.utcCron),
    description: `${s.description} (${s.istTime} IST)`,
  })
);

function utcCronToIstCron(utcCron: string): string {
  const parts = utcCron.trim().split(/\s+/);
  const utcMin = parseInt(parts[0] ?? '0', 10);
  const utcHour = parseInt(parts[1] ?? '0', 10);
  let totalMin = utcHour * 60 + utcMin + 330; // +5:30 IST
  if (totalMin >= 24 * 60) {
    totalMin -= 24 * 60;
  }
  const istHour = Math.floor(totalMin / 60);
  const istMin = totalMin % 60;
  return `${istMin} ${istHour} * * *`;
}

export const RADIOLOGY_UTC_CRON_TO_JOB = Object.fromEntries(
  RADIOLOGY_GHA_SCHEDULES.map((s) => [s.utcCron, s.id])
) as Record<string, ScheduledJobId>;
