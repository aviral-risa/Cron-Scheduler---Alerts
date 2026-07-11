import type { ScheduledJobId } from './scheduler-jobs';

export interface CloudSchedulerJobDef {
  id: ScheduledJobId;
  /** Google Cloud Scheduler cron (minute hour day month day-of-week) */
  schedule: string;
  description: string;
}

/** All jobs triggered by Google Cloud Scheduler → Cloud Run cron API */
export const CLOUD_SCHEDULER_JOBS: CloudSchedulerJobDef[] = [
  { id: 'metrics-sync-12am', schedule: '0 0 * * *', description: 'Daily metrics sync (previous day)' },
  { id: 'metrics-sync-5am', schedule: '0 5 * * *', description: 'Daily metrics sync (previous day)' },
  { id: 'metrics-sync-10am', schedule: '0 10 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-12pm', schedule: '0 12 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-2pm', schedule: '0 14 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-4pm', schedule: '0 16 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-6pm', schedule: '0 18 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-8pm', schedule: '0 20 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-10pm', schedule: '0 22 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'queue-sync', schedule: '5 0 * * *', description: 'Queue daily log snapshot' },
  { id: 'open-orders-refresh', schedule: '0 5 * * 1-5', description: 'Open orders re-sync (Mon-Fri)' },
  { id: 'retention-cleanup', schedule: '0 3 * * *', description: 'Sheet retention cleanup' },
  { id: 'medonc-daily-alerts', schedule: '0 9 * * 1-5', description: 'MedOnc daily alerts (Mon-Fri)' },
  { id: 'open-orders-summary', schedule: '0 9 * * 1-5', description: 'Open orders summary (Mon-Fri)' },
  { id: 'dos-coverage-org', schedule: '0 9 * * 1-5', description: 'DoS coverage org alerts (Mon-Fri)' },
  { id: 'capacity-check', schedule: '0 9 * * *', description: 'Sheet capacity monitoring' },
  { id: 'astera-yesterday-unworked', schedule: '30 15 * * *', description: 'Astera yesterday assigned unworked' },
  { id: 'astera-denial-internal', schedule: '0 16 * * *', description: 'Astera denial list (internal)' },
  { id: 'astera-onco-notes-quality', schedule: '15 16 * * *', description: 'Astera OncoEMR notes quality (4:15 PM IST)' },
  { id: 'astera-dashboard-sync', schedule: '0 11 * * *', description: 'Astera dashboard Sheets sync (11 AM IST)' },
  { id: 'astera-assigned-unworked', schedule: '0 17 * * *', description: 'Astera assigned unworked 2+ days' },
  { id: 'astera-query-return', schedule: '15 17 * * *', description: 'Astera query return re-allotment' },
  { id: 'slack-alerts', schedule: '0 22 * * *', description: 'Daily Slack performance alerts' },
  { id: 'astera-wip-stale', schedule: '0 22 * * *', description: 'Astera WIP > 1 day' },
  { id: 'astera-authmate-pending', schedule: '0 23 * * *', description: 'Astera AuthMate-Pending missed notes' },
];
