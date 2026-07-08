import 'dotenv/config';
import { sendTestAlertsMessage, getCurrentISTTime } from '../src/scheduler-jobs';

const text = [
  `*Cron + Dashboard Fix Report* (${getCurrentISTTime()} IST)`,
  '',
  '*Root cause (11 AM dashboard miss):*',
  '• GHA scheduled runs were *cancelled* at 90-min timeout while catching up a multi-day backlog',
  '• No failure alert reached test_alerts (channel_not_found + cancelled before dispatch error)',
  '',
  '*Fixes deployed (commit pending push):*',
  '• Cap *4 jobs per GHA tick* — prevents timeout backlog death spiral',
  '• Workflow timeout 45m + cancel-in-progress (no overlapping monster runs)',
  '• Yesterday catch-up marks *yesterday* completion date (not today)',
  '• All-day yesterday miss detection (removed 6 AM grace cutoff)',
  '• IST weekend checks (was UTC on GHA)',
  '• test_alerts fallback → default channel if bot not in channel',
  '• Failed metrics/queue jobs no longer marked complete',
  '',
  '*July dashboard (Lead Analyst):*',
  '• 30-day rolling sync completed with V3 SQL (30d unique lookback)',
  '• *2026-07-02*: Cases 86 / Unique 79 — store + visible ✓ match BQ',
  '• Unique column now differs from Cases Added (was identical before)',
  '',
  '*August tabs:* Auto-create 3 visible + 3 store when first August weekday syncs.',
  '',
  '_Production alerts unchanged — still fire on schedule to Astera internal channel._',
].join('\n');

sendTestAlertsMessage(text)
  .then(() => console.log('✓ Posted fix report to test_alerts'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
