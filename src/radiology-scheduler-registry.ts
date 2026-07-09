import type { ScheduledJobId } from './scheduler-jobs';

export interface CloudSchedulerJobDef {
  id: ScheduledJobId;
  /** Cron minute hour dom month dow (interpreted as IST) */
  schedule: string;
  description: string;
}

/** Astera Radiology only — runs on radiology-cron.yml */
export const RADIOLOGY_SCHEDULER_JOBS: CloudSchedulerJobDef[] = [
  { id: 'astera-denial-free-days', schedule: '0 4 * * *', description: 'Denial free days streak (4 AM IST)' },
  { id: 'astera-dashboard-sync', schedule: '0 11 * * *', description: 'Dashboard Sheets sync (11 AM IST)' },
  { id: 'astera-yesterday-unworked', schedule: '30 15 * * *', description: 'Yesterday assigned unworked (3:30 PM IST)' },
  { id: 'astera-denial-internal', schedule: '0 16 * * *', description: 'Daily denial list internal (4 PM IST)' },
  { id: 'astera-assigned-unworked', schedule: '0 17 * * *', description: 'Assigned unworked 2+ days (5 PM IST)' },
  { id: 'astera-query-return', schedule: '15 17 * * *', description: 'Query return re-allotment (5:15 PM IST)' },
  { id: 'astera-wip-stale', schedule: '0 22 * * *', description: 'WIP > 1 day (10 PM IST)' },
  { id: 'astera-authmate-pending', schedule: '0 23 * * *', description: 'AuthMate pending missed notes (11 PM IST)' },
];

/** Map GHA UTC cron expression → radiology job id (IST schedules converted to UTC). */
export const RADIOLOGY_UTC_CRON_TO_JOB: Record<string, ScheduledJobId> = {
  '30 5 * * *': 'astera-dashboard-sync', // 11:00 AM IST
  '0 10 * * *': 'astera-yesterday-unworked', // 3:30 PM IST
  '30 10 * * *': 'astera-denial-internal', // 4:00 PM IST
  '30 11 * * *': 'astera-assigned-unworked', // 5:00 PM IST
  '45 11 * * *': 'astera-query-return', // 5:15 PM IST
  '30 16 * * *': 'astera-wip-stale', // 10:00 PM IST
  '30 17 * * *': 'astera-authmate-pending', // 11:00 PM IST
};
