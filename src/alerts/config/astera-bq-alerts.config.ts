import 'dotenv/config';

/** Astera Radiology — BigQuery-backed daily Slack alerts */
export const ASTERA_RADIOLOGY_ORG_ID = 'rf5w1cNTGVfH9ZAJoLCF';

export const ASTERA_RADIOLOGY_NAME = 'Astera Radiology';

function resolveChannel(...candidates: Array<string | undefined>): string {
  const channel = candidates.find((value) => value && value.trim().length > 0);
  if (!channel) {
    throw new Error(
      'Set SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL / SLACK_CHANNEL_ASTERA_RADIOLOGY_GROUP ' +
        '(or fallback SLACK_CHANNEL) in .env'
    );
  }
  return channel;
}

export function getAsteraInternalChannelId(): string {
  return resolveChannel(
    process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL,
    process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY,
    process.env.SLACK_CHANNEL
  );
}

export function getAsteraGroupChannelId(): string {
  return resolveChannel(
    process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY_GROUP,
    process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL,
    process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY,
    process.env.SLACK_CHANNEL
  );
}

export const ASTERA_BQ_SQL_FILES = {
  denialInternal: 'daily-denial-list-internal-v1.sql',
  denialGroup: 'daily-denial-list-group-shareable-v1.sql',
  authmatePendingMissedNotes: 'daily-authmate-pending-missed-notes-v1.sql',
  assignedUnworkedStreak: 'astera-assigned-unworked-streak-v1.sql',
  wipOverOneDay: 'astera-wip-over-one-day-v1.sql',
  yesterdayAssignedUnworked: 'astera-yesterday-assigned-unworked-v1.sql',
  dailySummaryMetrics: 'astera-daily-summary-metrics-v1.sql',
  summaryCohortScanValue: 'astera-summary-cohort-scan-value-v1.sql',
  assigneeViewMetrics: 'astera-assignee-view-metrics-v1.sql',
  scanValueRows: 'astera-scan-value-rows-v1.sql',
  assigneeTat: 'astera-assignee-tat-v1.sql',
  queryReturnReallot: 'astera-query-return-reallot-v1.sql',
} as const;
