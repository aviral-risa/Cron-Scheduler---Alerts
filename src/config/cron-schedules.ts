/**
 * Centralized Cron Schedule Configuration
 * 
 * Single source of truth for all scheduled jobs in the system.
 * Used by both scheduler.ts and the System Config View.
 */

export interface CronSchedule {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression (node-cron format) */
  cron: string;
  /** Human-readable time (IST) */
  timeIST: string;
  /** Description of what the job does */
  description: string;
  /** Category for grouping */
  category: 'sync' | 'alert' | 'maintenance';
  /** Additional notes */
  notes?: string;
  /** Whether this job is currently enabled */
  enabled: boolean;
}

/**
 * All scheduled cron jobs in the system
 * Timezone: Asia/Kolkata (IST)
 */
export const CRON_SCHEDULES: CronSchedule[] = [
  // Daily Metrics Sync - Previous day (12AM, 5AM)
  {
    id: 'metrics-sync-12am',
    name: 'Daily Metrics Sync (12:00 AM)',
    cron: '0 0 * * *',
    timeIST: '12:00 AM',
    description: 'Sync previous day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs previous day if it was a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-5am',
    name: 'Daily Metrics Sync (05:00 AM)',
    cron: '0 5 * * *',
    timeIST: '05:00 AM',
    description: 'Sync previous day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs previous day if it was a workday',
    enabled: true,
  },
  // Daily Metrics Sync - Current day (10AM-10PM)
  {
    id: 'metrics-sync-10am',
    name: 'Daily Metrics Sync (10:00 AM)',
    cron: '0 10 * * *',
    timeIST: '10:00 AM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-12pm',
    name: 'Daily Metrics Sync (12:00 PM)',
    cron: '0 12 * * *',
    timeIST: '12:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-2pm',
    name: 'Daily Metrics Sync (02:00 PM)',
    cron: '0 14 * * *',
    timeIST: '02:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-4pm',
    name: 'Daily Metrics Sync (04:00 PM)',
    cron: '0 16 * * *',
    timeIST: '04:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-6pm',
    name: 'Daily Metrics Sync (06:00 PM)',
    cron: '0 18 * * *',
    timeIST: '06:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-8pm',
    name: 'Daily Metrics Sync (08:00 PM)',
    cron: '0 20 * * *',
    timeIST: '08:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  {
    id: 'metrics-sync-10pm',
    name: 'Daily Metrics Sync (10:00 PM)',
    cron: '0 22 * * *',
    timeIST: '10:00 PM',
    description: 'Sync current day\'s orders from Algolia → Google Sheets',
    category: 'sync',
    notes: 'Syncs current day if it is a workday',
    enabled: true,
  },
  // Queue View Sync
  {
    id: 'queue-sync',
    name: 'Queue View Sync',
    cron: '59 23 * * *',
    timeIST: '11:59 PM',
    description: 'Store daily queue snapshot to queue_daily_log sheet',
    category: 'sync',
    notes: 'Permanent daily snapshots in QUEUE spreadsheet',
    enabled: true,
  },
  // Slack Alerts
  {
    id: 'slack-alerts',
    name: 'Daily Slack Alerts',
    cron: '0 22 * * *',
    timeIST: '10:00 PM',
    description: 'Send daily unworked orders alerts to Slack channels',
    category: 'alert',
    notes: 'Sends to org-specific Slack channels',
    enabled: true,
  },
  // Maintenance Jobs
  {
    id: 'retention-cleanup',
    name: 'Retention Policy Cleanup',
    cron: '0 3 * * *',
    timeIST: '03:00 AM',
    description: 'Delete old data from DASHBOARD sheet to stay under cell limits',
    category: 'maintenance',
    notes: 'Keeps last 30 days of org/person metrics',
    enabled: true,
  },
  {
    id: 'capacity-check',
    name: 'Sheet Capacity Check',
    cron: '0 9 * * *',
    timeIST: '09:00 AM',
    description: 'Monitor cell counts and alert if approaching limits',
    category: 'maintenance',
    notes: 'Alerts if RAW DATA LAKE > 80% or DASHBOARD > 100k cells',
    enabled: true,
  },
];

/**
 * Get schedules by category
 */
export function getSchedulesByCategory(category: CronSchedule['category']): CronSchedule[] {
  return CRON_SCHEDULES.filter((s) => s.category === category);
}

/**
 * Get all enabled schedules
 */
export function getEnabledSchedules(): CronSchedule[] {
  return CRON_SCHEDULES.filter((s) => s.enabled);
}

/**
 * Get schedule by ID
 */
export function getScheduleById(id: string): CronSchedule | undefined {
  return CRON_SCHEDULES.find((s) => s.id === id);
}
