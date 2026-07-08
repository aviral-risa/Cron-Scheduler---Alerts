import type { ScheduledJobId } from './scheduler-jobs';

export interface CloudSchedulerJobDef {
  id: ScheduledJobId;
  schedule: string;
  description: string;
}

/** MedOnc + ops jobs — NOT Astera. Runs on medonc-cron.yml */
export const MEDONC_SCHEDULER_JOBS: CloudSchedulerJobDef[] = [
  // Alerts first (priority in dispatcher)
  { id: 'medonc-daily-alerts', schedule: '0 9 * * 1-5', description: 'MedOnc daily alerts (Mon-Fri 9 AM IST)' },
  { id: 'open-orders-summary', schedule: '0 9 * * 1-5', description: 'Open orders summary (Mon-Fri 9 AM IST)' },
  { id: 'dos-coverage-org', schedule: '0 9 * * 1-5', description: 'DoS coverage org alerts (Mon-Fri 9 AM IST)' },
  { id: 'slack-alerts', schedule: '0 22 * * *', description: 'Daily Slack performance alerts (10 PM IST)' },
  // Maintenance
  { id: 'queue-sync', schedule: '5 0 * * *', description: 'Queue daily log snapshot' },
  { id: 'retention-cleanup', schedule: '0 3 * * *', description: 'Sheet retention cleanup' },
  { id: 'capacity-check', schedule: '0 9 * * *', description: 'Sheet capacity monitoring' },
  { id: 'open-orders-refresh', schedule: '0 5 * * 1-5', description: 'Open orders re-sync (Mon-Fri 5 AM IST)' },
  // Metrics sync last (heavy; must not block alerts)
  { id: 'metrics-sync-12am', schedule: '0 0 * * *', description: 'Daily metrics sync (previous day)' },
  { id: 'metrics-sync-5am', schedule: '0 5 * * *', description: 'Daily metrics sync (previous day)' },
  { id: 'metrics-sync-10am', schedule: '0 10 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-12pm', schedule: '0 12 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-2pm', schedule: '0 14 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-4pm', schedule: '0 16 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-6pm', schedule: '0 18 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-8pm', schedule: '0 20 * * *', description: 'Daily metrics sync (current day)' },
  { id: 'metrics-sync-10pm', schedule: '0 22 * * *', description: 'Daily metrics sync (current day)' },
];
