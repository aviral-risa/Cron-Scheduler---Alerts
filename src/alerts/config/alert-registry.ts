/**
 * Alert Registry - Central documentation of all Slack alerts
 *
 * This registry serves as the single source of truth for all available alerts,
 * their schedules, capabilities, and metadata. Used by the scheduler for
 * dynamic alert loading and by CLI for documentation.
 */

export interface AlertMetadata {
  /** Unique identifier (e.g., 'queue-view', 'denial-tracking') */
  id: string;

  /** Human-readable display name */
  name: string;

  /** Description of what the alert does */
  description: string;

  /** Cron schedule if automated (e.g., '0 22 * * *' for 10 PM daily) */
  schedule?: string;

  /** Whether this alert can be filtered by organization */
  supportsOrgFilter: boolean;

  /** Whether this alert has a preview mode */
  supportsPreview: boolean;

  /** Name of the exported function to call */
  functionName: string;

  /** Whether this alert is currently enabled */
  enabled: boolean;

  /** Category for grouping (e.g., 'performance', 'queue', 'tracking') */
  category: 'performance' | 'queue' | 'tracking' | 'funnel' | 'daily';
}

/**
 * Registry of all available Slack alerts
 *
 * Note: This will be populated as alerts are migrated to the new structure
 */
export const ALERT_REGISTRY: AlertMetadata[] = [
  {
    id: 'unworked-orders',
    name: 'Daily Unworked Orders Report',
    description: 'Reports providers with assigned but not completed orders',
    schedule: '0 22 * * *', // 10 PM IST daily
    supportsOrgFilter: true,
    supportsPreview: false,
    functionName: 'sendUnworkedOrdersAlerts',
    enabled: true,
    category: 'daily',
  },
  {
    id: 'queue-view',
    name: 'Queue Status Report',
    description: 'Displays open orders queue status by provider with breakdown by status (New, Pending, Query, Hold, Auth Required)',
    supportsOrgFilter: true,
    supportsPreview: true,
    functionName: 'sendQueueAlertsForAll',
    enabled: true,
    category: 'queue',
  },
  {
    id: 'open-orders-summary',
    name: 'Open Orders Summary (Jan 1 to Today)',
    description: 'Shows all working days from Jan 1 to today with open orders breakdown by status',
    supportsOrgFilter: true,
    supportsPreview: false,
    functionName: 'sendOpenOrdersSummaryAlerts',
    enabled: true,
    category: 'tracking',
  },
  {
    id: 'daily-performance',
    name: 'Daily Performance Alert',
    description: 'Performance metrics with status indicators (5 business days)',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendDailyPerformanceAlert',
    enabled: true,
    category: 'performance',
  },
  {
    id: 'denial-tracking',
    name: 'Denial Tracking',
    description: 'Last 7 days of denial tracking data (denial by RISA, denial after query, existing denials)',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendDenialTrackingAlert',
    enabled: true,
    category: 'tracking',
  },
  {
    id: 'org-breakdown',
    name: 'Organization Breakdown',
    description: '14-day orders worked breakdown by organization (NYCBS, CHC, MBPCC, UCBC)',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendOrgBreakdownAlert',
    enabled: true,
    category: 'performance',
  },
  {
    id: 'performance',
    name: 'Performance Alert',
    description: 'Daily performance metrics alert',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendPerformanceAlert',
    enabled: true,
    category: 'performance',
  },
  {
    id: 'real-performance',
    name: 'Real Performance Alert',
    description: 'Real performance data from Google Sheets',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendRealPerformanceAlert',
    enabled: true,
    category: 'performance',
  },
  {
    id: 'performance-summary',
    name: 'Performance Summary',
    description: 'Alternative performance summary with metric breakdown',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendPerformanceSummary',
    enabled: true,
    category: 'performance',
  },
  {
    id: 'orders-funnel',
    name: 'Orders Funnel',
    description: 'Orders funnel analysis (loaded → assigned → completed)',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendOrdersFunnelAlert',
    enabled: true,
    category: 'funnel',
  },
  {
    id: 'daily',
    name: 'Daily Alert',
    description: 'General daily alert framework',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendDailyAlert',
    enabled: true,
    category: 'daily',
  },
  {
    id: 'dos-coverage',
    name: 'DoS Coverage',
    description: 'Payer treatment aging by DoS bucket (loaded/billed breakdown by T+0-7, T+8-14, T+15-21, T+21+)',
    schedule: '0 9 * * 1-5', // 9:00 AM IST Mon-Fri (with Daily Orders Billed + Approval Rate)
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendDosCoverageAlert',
    enabled: true,
    category: 'tracking',
  },
  {
    id: 'astera-denial-internal',
    name: 'Astera Denial List (Internal)',
    description: 'BigQuery daily denial list with MRN, denial note, assignee, query context for Astera Radiology',
    schedule: '0 16 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraDenialInternalAlert',
    enabled: true,
    category: 'tracking',
  },
  {
    id: 'astera-denial-group',
    name: 'Astera Denial List (Group)',
    description: 'Reduced daily denial list (MRN + denial note) for Astera Radiology private group channel',
    schedule: '0 16 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraDenialGroupAlert',
    enabled: false,
    category: 'tracking',
  },
  {
    id: 'astera-authmate-pending-notes',
    name: 'Astera AuthMate-Pending Missed Notes',
    description: 'AuthMate-Pending cases missing required IST staff-day notes for Astera Radiology',
    schedule: '0 23 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraAuthmatePendingMissedNotesAlert',
    enabled: true,
    category: 'tracking',
  },
  {
    id: 'astera-assigned-unworked-streak',
    name: 'Astera Assigned Unworked (2+ Days)',
    description: 'Cases assigned 2+ IST days ago still in New status',
    schedule: '0 17 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraAssignedUnworkedStreakAlert',
    enabled: true,
    category: 'queue',
  },
  {
    id: 'astera-wip-over-one-day',
    name: 'Astera Work In Progress > 1 Day',
    description: 'Cases stuck in work_in_progress for >=1 IST business day (excludes holidays)',
    schedule: '0 22 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraWipOverOneDayAlert',
    enabled: true,
    category: 'queue',
  },
  {
    id: 'astera-yesterday-assigned-unworked',
    name: "Astera Yesterday's Assigned Still Unworked",
    description: 'Cases assigned yesterday (IST) still in New — re-allocation list per assignee',
    schedule: '30 15 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraYesterdayAssignedUnworkedAlert',
    enabled: true,
    category: 'queue',
  },
  {
    id: 'astera-query-return-reallot',
    name: 'Astera Query Return Re-allotment',
    description: 'Cases returned from query to workable status with initial assignee for re-allotment',
    schedule: '15 17 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraQueryReturnReallotAlert',
    enabled: true,
    category: 'queue',
  },
  {
    id: 'astera-onco-notes-quality',
    name: 'Astera OncoEMR Notes Quality',
    description:
      'Audits pasted OncoEMR notes and missing pastes against Auth Status / BO mapping templates',
    schedule: '15 16 * * *',
    supportsOrgFilter: false,
    supportsPreview: false,
    functionName: 'sendAsteraOncoNotesQualityAlert',
    enabled: true,
    category: 'tracking',
  },
];

/**
 * Get alert metadata by ID
 */
export function getAlertById(id: string): AlertMetadata | undefined {
  return ALERT_REGISTRY.find((alert) => alert.id === id);
}

/**
 * Get all scheduled alerts (alerts with a cron schedule)
 */
export function getScheduledAlerts(): AlertMetadata[] {
  return ALERT_REGISTRY.filter((alert) => alert.schedule && alert.enabled);
}

/**
 * Get all manual alerts (alerts without a schedule)
 */
export function getManualAlerts(): AlertMetadata[] {
  return ALERT_REGISTRY.filter((alert) => !alert.schedule);
}

/**
 * Get alerts by category
 */
export function getAlertsByCategory(category: AlertMetadata['category']): AlertMetadata[] {
  return ALERT_REGISTRY.filter((alert) => alert.category === category);
}

/**
 * List all alerts (for CLI display)
 */
export function listAllAlerts(): void {
  console.log('\n📢 Available Slack Alerts:\n');
  console.log('Scheduled Alerts:');
  getScheduledAlerts().forEach((alert) => {
    console.log(`  • ${alert.name} (${alert.id})`);
    console.log(`    Schedule: ${alert.schedule}`);
    console.log(`    ${alert.description}`);
    console.log('');
  });

  console.log('Manual Alerts:');
  getManualAlerts().forEach((alert) => {
    console.log(`  • ${alert.name} (${alert.id})`);
    console.log(`    ${alert.description}`);
    if (alert.supportsOrgFilter) {
      console.log(`    Supports org filtering: Yes`);
    }
    if (alert.supportsPreview) {
      console.log(`    Supports preview mode: Yes`);
    }
    console.log('');
  });
}
