import { format } from 'date-fns';
import { sendUnworkedOrdersAlerts } from './alerts/unworked-orders-alert';
import { sendL0BusinessOutputAlert } from './alerts/l0-business-output-alert';
import { sendApprovalRateTrendingAlert } from './alerts/approval-rate-trending-alert';
import { sendDosCoverageAlert } from './alerts/dos-coverage-alert';
import { sendOpenOrdersSummaryAlerts } from './alerts/open-orders-summary-alert';
import { sendDosCoverageOrgAlerts } from './alerts/dos-coverage-org-alert';
import {
  sendAsteraDenialInternalAlert,
  sendAsteraAuthmatePendingMissedNotesAlert,
} from './alerts/bq/astera-daily-alerts';
import { sendAsteraDenialFreeDaysWithHealth } from './alerts/bq/astera-denial-free-days-alert';
import {
  sendAsteraAssignedUnworkedStreakAlert,
  sendAsteraWipOverOneDayAlert,
  sendAsteraYesterdayAssignedUnworkedAlert,
  sendAsteraQueryReturnReallotAlert,
} from './alerts/bq/astera-workload-alerts';
import { sendAsteraOncoNotesQualityAlert } from './alerts/bq/astera-notes-quality-alert';
import { shouldRunAuthmatePendingAlert } from './alerts/utils/report-dates';
import { shouldSkipAsteraJobForHoliday } from './alerts/utils/astera-workday';
import {
  getTodayIstDateKey,
  getYesterdayIstDateKey,
  hasJobCompletedOnDate,
  hasJobCompletedToday,
  isPastScheduledTimeToday,
  markJobCompletedOnDate,
  markJobCompletedToday,
  type ScheduledJobSpec,
} from './scheduler-job-state';
import { syncAsteraDashboardRollingWindow } from './alerts/bq/astera-dashboard-sync';
import { syncOrderData, syncOrgData } from './services/sync';
import { syncQueueDataForAllFacilities } from './services/sync/queueSync';
import { enforceRetentionPolicy } from './services/sheets-retention';
import { checkSheetCapacity } from './services/sheets-monitor';
import { getExistingOrderStatusMap } from './services/sheets-dual';
import { getOrganizationByFacilityId } from './config/organizations';
import { MEDICAL_ORDER_STATUS } from './types/agentModeMetrics';
import { toISTDate } from './utils/timezone';
import { SlackConfig } from './alerts/config/slack.config';
import { WebClient } from '@slack/web-api';

export function getCurrentISTTime(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export async function sendSlackNotification(text: string): Promise<void> {
  try {
    const botToken = SlackConfig.getBotToken();
    const channelId = SlackConfig.getDefaultChannelId();
    const web = new WebClient(botToken);
    await web.chat.postMessage({ channel: channelId, text });
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
  }
}

export type CronSkipReason =
  | 'already_completed_today'
  | 'holiday_skip'
  | 'authmate_weekend_skip'
  | 'catch_up_missed'
  | 'job_failed';

export function isManualCronRun(): boolean {
  return process.env.MANUAL_CRON_RUN === 'true';
}

export async function sendCronSkipNotification(
  jobId: string,
  reason: CronSkipReason,
  extra?: { scheduledTime?: string; catchUpFor?: string }
): Promise<void> {
  const reasonMessages: Record<CronSkipReason, string> = {
    already_completed_today: 'Skipped — already completed today',
    holiday_skip: 'Skipped — Astera holiday (no allotment)',
    authmate_weekend_skip: 'Skipped — EST weekend (AuthMate pending)',
    catch_up_missed: extra?.scheduledTime
      ? `Missed scheduled window — running catch-up (was due ${extra.scheduledTime} IST${extra.catchUpFor ? `, for ${extra.catchUpFor}` : ''})`
      : 'Missed scheduled window — running catch-up',
    job_failed: extra?.scheduledTime ?? 'Job threw an error during execution',
  };

  const heading =
    reason === 'catch_up_missed' ? 'Cron catch-up' : reason === 'job_failed' ? 'Cron failure' : 'Cron skip';
  const text =
    `↷ *${heading}*: \`${jobId}\`\n` +
    `${reasonMessages[reason]}\n` +
    `_${getCurrentISTTime()} IST_`;

  try {
    const botToken = SlackConfig.getBotToken();
    const channelId = SlackConfig.getTestAlertsChannelId();
    const web = new WebClient(botToken);
    await web.chat.postMessage({ channel: channelId, text });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send cron skip notification (${jobId}, ${reason}):`, error);
    if (errMsg.includes('channel_not_found') || errMsg.includes('not_in_channel')) {
      try {
        const web = new WebClient(SlackConfig.getBotToken());
        await web.chat.postMessage({
          channel: SlackConfig.getAsteraAlertsChannelId(),
          text: `[test_alerts (${SlackConfig.getTestAlertsChannelId()}) unreachable — posted to Astera channel]\n${text}`,
        });
      } catch (fallbackErr) {
        console.error('Cron notification fallback also failed:', fallbackErr);
      }
    }
  }
}

/** Post operational message to test_alerts (with fallback to default channel). */
export async function sendTestAlertsMessage(text: string): Promise<void> {
  try {
    const web = new WebClient(SlackConfig.getBotToken());
    await web.chat.postMessage({ channel: SlackConfig.getTestAlertsChannelId(), text });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Failed to send test_alerts message:', error);
    if (errMsg.includes('channel_not_found') || errMsg.includes('not_in_channel')) {
      const web = new WebClient(SlackConfig.getBotToken());
      await web.chat.postMessage({
        channel: SlackConfig.getAsteraAlertsChannelId(),
        text: `[test_alerts (${SlackConfig.getTestAlertsChannelId()}) unreachable — posted to Astera channel]\n${text}`,
      });
    }
  }
}

export async function sendCronFailureNotification(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await sendCronSkipNotification(jobId, 'job_failed', { scheduledTime: message.slice(0, 500) });
}

function isWeekendIstYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(noonUtc);
  return weekday === 'Sat' || weekday === 'Sun';
}

function isWeekendIst(reference = new Date()): boolean {
  return isWeekendIstYmd(getTodayIstDateKey(reference));
}

export interface RunJobOptions {
  completionDateKey?: string;
}

let activeJobOptions: RunJobOptions = {};

function getCompletionDateKey(): string {
  return activeJobOptions.completionDateKey ?? getTodayIstDateKey();
}

export async function runDailyMetricsSync(usePreviousDay: boolean = false): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Daily Metrics Sync');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  let targetDate: Date;
  if (usePreviousDay) {
    const prevYmd = getYesterdayIstDateKey();
    if (isWeekendIstYmd(prevYmd)) {
      console.log(`   Skipped - Previous day (${prevYmd}) was a weekend (IST)`);
      return;
    }
    targetDate = new Date(`${prevYmd}T12:00:00Z`);
    console.log(`   Syncing PREVIOUS day's orders: ${prevYmd}`);
  } else {
    if (isWeekendIst()) {
      console.log(`   Skipped - Current day (${getTodayIstDateKey()}) is a weekend (IST)`);
      return;
    }
    targetDate = new Date();
    console.log(`   Syncing CURRENT day's orders: ${getTodayIstDateKey()}`);
  }

  const dateStr = format(targetDate, 'yyyy-MM-dd');

  await sendSlackNotification(
    `🔄 *Daily Metrics Sync Started* (${getCurrentISTTime()} IST)\nDate: *${dateStr}* | Mode: ${usePreviousDay ? 'Previous day' : 'Current day'}`
  );

  try {
    console.log(`   Syncing unique orders + metrics for ALL organizations...`);
    await syncOrderData(new Date(dateStr), false, undefined);
    console.log(`   ✓ Full sync completed successfully for all organizations`);

    console.log('   🔍 Running duplicate detection...');
    const { detectDuplicates } = await import('./scripts/detect-duplicates');
    const dupResult = await detectDuplicates();

    const dupSummary =
      dupResult.markedDuplicate > 0
        ? `\n🔍 Duplicates: *${dupResult.markedDuplicate}* marked | ${dupResult.unmarked} unmarked | ${dupResult.keysWithDuplicates} key groups`
        : `\n🔍 Duplicates: None found`;

    await sendSlackNotification(
      `✅ *Daily Metrics Sync Completed* (${getCurrentISTTime()} IST)\nDate: *${dateStr}*${dupSummary}`
    );
  } catch (error) {
    console.error(`   ❌ Error during sync:`, error);
    await sendSlackNotification(
      `❌ *Daily Metrics Sync Failed* (${getCurrentISTTime()} IST)\nDate: *${dateStr}*\nError: ${error}`
    );
    throw error;
  }

  console.log('✓ Daily Metrics sync completed\n');
}

export async function runQueueDataSync(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Queue Data Sync');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  const today = new Date();

  if (isWeekendIst()) {
    console.log(`   Skipped - Current day (${getTodayIstDateKey()}) is a weekend (IST)`);
    return;
  }

  await sendSlackNotification(`🔄 *Queue Data Sync Started* (${getCurrentISTTime()} IST)`);

  try {
    await syncQueueDataForAllFacilities();
    console.log('✓ Queue Data sync completed successfully\n');
    await sendSlackNotification(`✅ *Queue Data Sync Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running Queue Data sync:', error);
    await sendSlackNotification(`❌ *Queue Data Sync Failed* (${getCurrentISTTime()} IST)\nError: ${error}`);
    throw error;
  }
}

async function runAsteraAlertJob(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n⏰ Astera alert: ${name} (${getCurrentISTTime()} IST)`);
  try {
    await fn();
    console.log(`✓ Astera alert completed: ${name}\n`);
  } catch (error) {
    console.error(`❌ Astera alert failed (${name}):`, error);
    await sendSlackNotification(`❌ *Astera ${name} failed* (${getCurrentISTTime()} IST)\n${error}`);
    throw error;
  }
}

async function runAsteraDashboardSync(): Promise<void> {
  console.log(`\n⏰ Astera dashboard Sheets sync (${getCurrentISTTime()} IST)`);
  try {
  const cronWindowDays = Number(process.env.ASTERA_DASHBOARD_CRON_WINDOW_DAYS ?? 3);
    await syncAsteraDashboardRollingWindow(cronWindowDays, { skipFormatting: true });
    console.log('✓ Astera dashboard sync completed\n');
  } catch (error) {
    console.error('❌ Astera dashboard Sheets sync failed:', error);
    await sendTestAlertsMessage(
      `❌ *Astera Dashboard Sheets sync failed* (${getCurrentISTTime()} IST)\n${error}`
    );
    throw error;
  }
}

async function runTrackedAsteraJob(spec: ScheduledJobSpec, fn: () => Promise<void>): Promise<void> {
  const completionKey = getCompletionDateKey();
  if (!isManualCronRun() && (await hasJobCompletedOnDate(spec.id, completionKey))) {
    console.log(`ℹ️ Skipping ${spec.label} — already completed for ${completionKey} (IST)`);
    await sendCronSkipNotification(spec.id, 'already_completed_today');
    return;
  }
  if (await shouldSkipAsteraJobForHoliday(spec.id as ScheduledJobId)) {
    await markJobCompletedOnDate(spec.id, completionKey);
    await sendCronSkipNotification(spec.id, 'holiday_skip');
    return;
  }
  await runAsteraAlertJob(spec.label, fn);
  await markJobCompletedOnDate(spec.id, completionKey);
}

async function runTrackedAsteraDashboardSync(spec: ScheduledJobSpec): Promise<void> {
  const completionKey = getCompletionDateKey();
  if (!isManualCronRun() && (await hasJobCompletedOnDate(spec.id, completionKey))) {
    console.log(`ℹ️ Skipping ${spec.label} — already completed for ${completionKey} (IST)`);
    await sendCronSkipNotification(spec.id, 'already_completed_today');
    return;
  }
  if (await shouldSkipAsteraJobForHoliday(spec.id as ScheduledJobId)) {
    await markJobCompletedOnDate(spec.id, completionKey);
    await sendCronSkipNotification(spec.id, 'holiday_skip');
    return;
  }
  await runAsteraDashboardSync();
  await markJobCompletedOnDate(spec.id, completionKey);
}

async function runTrackedAuthmatePending(spec: ScheduledJobSpec): Promise<void> {
  const completionKey = getCompletionDateKey();
  if (!isManualCronRun() && (await hasJobCompletedOnDate(spec.id, completionKey))) {
    console.log(`ℹ️ Skipping ${spec.label} — already completed for ${completionKey} (IST)`);
    await sendCronSkipNotification(spec.id, 'already_completed_today');
    return;
  }
  if (!shouldRunAuthmatePendingAlert()) {
    console.log('ℹ️ Skipping AuthMate-Pending alert — today is an EST weekend');
    await markJobCompletedOnDate(spec.id, completionKey);
    await sendCronSkipNotification(spec.id, 'authmate_weekend_skip');
    return;
  }
  if (await shouldSkipAsteraJobForHoliday(spec.id as ScheduledJobId)) {
    await markJobCompletedOnDate(spec.id, completionKey);
    await sendCronSkipNotification(spec.id, 'holiday_skip');
    return;
  }
  await runAsteraAlertJob(spec.label, sendAsteraAuthmatePendingMissedNotesAlert);
  await markJobCompletedOnDate(spec.id, completionKey);
}

export const ASTERA_JOB_SPECS: ScheduledJobSpec[] = [
  { id: 'astera-denial-free-days', hour: 4, minute: 0, label: 'Denial free days streak' },
  { id: 'astera-yesterday-unworked', hour: 15, minute: 30, label: 'Yesterday assigned unworked' },
  { id: 'astera-denial-internal', hour: 16, minute: 0, label: 'Denial list (internal)' },
  { id: 'astera-onco-notes-quality', hour: 16, minute: 15, label: 'OncoEMR notes quality' },
  { id: 'astera-dashboard-sync', hour: 11, minute: 0, label: 'Dashboard Sheets sync' },
  { id: 'astera-assigned-unworked', hour: 17, minute: 0, label: 'Assigned unworked (2+ days)' },
  { id: 'astera-query-return', hour: 17, minute: 15, label: 'Query return re-allotment' },
  { id: 'astera-wip-stale', hour: 22, minute: 0, label: 'WIP > 1 day' },
  { id: 'astera-authmate-pending', hour: 23, minute: 0, label: 'AuthMate-Pending missed notes' },
];

export async function dispatchAsteraJob(jobId: string): Promise<void> {
  const spec = ASTERA_JOB_SPECS.find((j) => j.id === jobId);
  if (!spec) {
    return;
  }
  switch (jobId) {
    case 'astera-denial-free-days':
      await runTrackedAsteraJob(spec, sendAsteraDenialFreeDaysWithHealth);
      break;
    case 'astera-yesterday-unworked':
      await runTrackedAsteraJob(spec, sendAsteraYesterdayAssignedUnworkedAlert);
      break;
    case 'astera-denial-internal':
      await runTrackedAsteraJob(spec, sendAsteraDenialInternalAlert);
      break;
    case 'astera-onco-notes-quality':
      await runTrackedAsteraJob(spec, sendAsteraOncoNotesQualityAlert);
      break;
    case 'astera-dashboard-sync':
      await runTrackedAsteraDashboardSync(spec);
      break;
    case 'astera-assigned-unworked':
      await runTrackedAsteraJob(spec, sendAsteraAssignedUnworkedStreakAlert);
      break;
    case 'astera-query-return':
      await runTrackedAsteraJob(spec, sendAsteraQueryReturnReallotAlert);
      break;
    case 'astera-wip-stale':
      await runTrackedAsteraJob(spec, sendAsteraWipOverOneDayAlert);
      break;
    case 'astera-authmate-pending':
      await runTrackedAuthmatePending(spec);
      break;
  }
}

export async function catchUpMissedAsteraJobs(): Promise<void> {
  console.log(`\n🔄 Astera catch-up check (IST ${getTodayIstDateKey()})...`);
  let ran = 0;
  for (const spec of ASTERA_JOB_SPECS) {
    if (!isPastScheduledTimeToday(spec)) {
      continue;
    }
    if (await hasJobCompletedToday(spec.id)) {
      continue;
    }
    console.log(`   ↳ Running missed: ${spec.label}`);
    await dispatchAsteraJob(spec.id);
    ran += 1;
  }
  console.log(
    ran === 0 ? '   ✓ No missed Astera jobs to catch up\n' : `   ✓ Catch-up finished (${ran} job(s))\n`
  );
}

export async function runSlackAlerts(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Daily Slack Alerts');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  await sendSlackNotification(`🔄 *Daily Slack Alerts Started* (${getCurrentISTTime()} IST)`);

  try {
    await sendUnworkedOrdersAlerts();
    console.log('✓ Daily Slack alerts completed successfully\n');
    await sendSlackNotification(`✅ *Daily Slack Alerts Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running daily Slack alerts:', error);
    await sendSlackNotification(`❌ *Daily Slack Alerts Failed* (${getCurrentISTTime()} IST)\nError: ${error}`);
  }
}

export async function runMedOncDailyAlerts(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: MedOnc Daily Alerts');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  await sendSlackNotification(
    `🔄 *MedOnc Daily Alerts Started* (${getCurrentISTTime()} IST)\n• Daily Orders Billed\n• Approval Rate\n• DoS Coverage`
  );

  const failures: string[] = [];

  try {
    await sendL0BusinessOutputAlert();
    console.log('✓ Daily Orders Billed sent successfully');
  } catch (error) {
    console.error('❌ Error sending Daily Orders Billed:', error);
    failures.push(`Daily Orders Billed: ${error}`);
  }

  try {
    await sendApprovalRateTrendingAlert();
    console.log('✓ Approval Rate sent successfully');
  } catch (error) {
    console.error('❌ Error sending Approval Rate:', error);
    failures.push(`Approval Rate: ${error}`);
  }

  try {
    await sendDosCoverageAlert();
    console.log('✓ DoS Coverage sent successfully\n');
  } catch (error) {
    console.error('❌ Error sending DoS Coverage:', error);
    failures.push(`DoS Coverage: ${error}`);
  }

  if (failures.length > 0) {
    await sendSlackNotification(
      `⚠️ *MedOnc Daily Alerts Completed with Errors* (${getCurrentISTTime()} IST)\n${failures.map((f) => `• ❌ ${f}`).join('\n')}`
    );
  } else {
    await sendSlackNotification(`✅ *MedOnc Daily Alerts Completed* (${getCurrentISTTime()} IST)`);
  }
}

export async function runOpenOrdersSummaryJob(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Open Orders Summary');
  console.log(`   Time: ${getCurrentISTTime()} IST`);
  await sendSlackNotification(`🔄 *Open Orders Summary Alerts Started* (${getCurrentISTTime()} IST)`);
  try {
    await sendOpenOrdersSummaryAlerts();
    console.log('✓ Open Orders Summary alerts completed successfully\n');
    await sendSlackNotification(`✅ *Open Orders Summary Alerts Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running Open Orders Summary alerts:', error);
    await sendSlackNotification(
      `❌ *Open Orders Summary Alerts Failed* (${getCurrentISTTime()} IST)\nError: ${error}`
    );
  }
}

export async function runDosCoverageOrgJob(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: DoS Coverage Org-Level');
  console.log(`   Time: ${getCurrentISTTime()} IST`);
  await sendSlackNotification(`🔄 *DoS Coverage Org-Level Alerts Started* (${getCurrentISTTime()} IST)`);
  try {
    await sendDosCoverageOrgAlerts();
    console.log('✓ DoS Coverage Org-Level alerts completed successfully\n');
    await sendSlackNotification(`✅ *DoS Coverage Org-Level Alerts Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running DoS Coverage Org-Level alerts:', error);
    await sendSlackNotification(
      `❌ *DoS Coverage Org-Level Alerts Failed* (${getCurrentISTTime()} IST)\nError: ${error}`
    );
  }
}

export async function runRetentionCleanup(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Retention Policy Cleanup');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  await sendSlackNotification(`🔄 *Retention Policy Cleanup Started* (${getCurrentISTTime()} IST)`);

  try {
    await enforceRetentionPolicy();
    console.log('✓ Retention policy cleanup completed successfully\n');
    await sendSlackNotification(`✅ *Retention Policy Cleanup Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running retention policy cleanup:', error);
    await sendSlackNotification(`❌ *Retention Policy Cleanup Failed* (${getCurrentISTTime()} IST)\nError: ${error}`);
  }
}

export async function runCapacityCheck(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Sheet Capacity Check');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  await sendSlackNotification(`🔄 *Sheet Capacity Check Started* (${getCurrentISTTime()} IST)`);

  try {
    await checkSheetCapacity();
    console.log('✓ Sheet capacity check completed successfully\n');
    await sendSlackNotification(`✅ *Sheet Capacity Check Completed* (${getCurrentISTTime()} IST)`);
  } catch (error) {
    console.error('❌ Error running sheet capacity check:', error);
    await sendSlackNotification(`❌ *Sheet Capacity Check Failed* (${getCurrentISTTime()} IST)\nError: ${error}`);
  }
}

export async function runOpenOrdersRefresh(): Promise<void> {
  console.log('\n⏰ Scheduled task triggered: Open Orders Re-Sync');
  console.log(`   Time: ${getCurrentISTTime()} IST`);

  try {
    const orderMap = await getExistingOrderStatusMap();
    console.log(`   Read ${orderMap.size} total orders from unique_orders_status`);

    const completedStatuses = new Set([
      MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT,
      MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN,
    ]);

    const orgDateMap = new Map<string, Set<string>>();
    let openOrderCount = 0;

    Array.from(orderMap.values()).forEach((order) => {
      if (order.medical_order_status && completedStatuses.has(order.medical_order_status as any)) {
        return;
      }
      openOrderCount++;

      const facilityId = order.org_id;
      const dateStr = toISTDate(order.created_at_iso);

      if (!orgDateMap.has(facilityId)) {
        orgDateMap.set(facilityId, new Set());
      }
      orgDateMap.get(facilityId)!.add(dateStr);
    });

    console.log(`   Found ${openOrderCount} open orders across ${orgDateMap.size} orgs`);

    if (orgDateMap.size === 0) {
      await sendSlackNotification(
        `🔄 *Open Orders Re-Sync* (${getCurrentISTTime()} IST)\nNo open orders found — nothing to re-sync.`
      );
      console.log('   No open orders found — nothing to re-sync');
      console.log('✓ Open Orders Re-Sync completed\n');
      return;
    }

    const entries = Array.from(orgDateMap.entries());
    const orgSummaryLines = entries.map(([fId, dates]) => {
      const o = getOrganizationByFacilityId(fId);
      return `• ${o?.name ?? fId}: ${dates.size} date(s)`;
    });
    await sendSlackNotification(
      `🔄 *Open Orders Re-Sync Started* (${getCurrentISTTime()} IST)\n` +
        `Found *${openOrderCount}* open orders across *${orgDateMap.size}* org(s):\n` +
        orgSummaryLines.join('\n')
    );

    for (let i = 0; i < entries.length; i++) {
      const [facilityId, dates] = entries[i];
      const org = getOrganizationByFacilityId(facilityId);
      const facilityName = org?.name ?? facilityId;
      const dateList = Array.from(dates);

      console.log(`   🔄 ${facilityName}: re-syncing ${dateList.length} date(s)`);

      for (let j = 0; j < dateList.length; j++) {
        try {
          await syncOrgData(new Date(dateList[j]), facilityId, facilityName);
          console.log(`      ✓ ${dateList[j]}`);
        } catch (error) {
          console.error(`      ❌ ${dateList[j]}:`, error);
        }
      }
    }

    console.log('\n   📋 Summary:');
    const completionLines: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [facilityId, dates] = entries[i];
      const org = getOrganizationByFacilityId(facilityId);
      const facilityName = org?.name ?? facilityId;
      console.log(`      ${facilityName}: ${dates.size} date(s) re-synced`);
      completionLines.push(`• ${facilityName}: ${dates.size} date(s) re-synced`);
    }

    console.log('\n   🔍 Running duplicate detection...');
    const { detectDuplicates: detectDupsScheduled } = await import('./scripts/detect-duplicates');
    const dupResult = await detectDupsScheduled();

    const dupSummary =
      dupResult.markedDuplicate > 0
        ? `\n🔍 Duplicates: *${dupResult.markedDuplicate}* marked | ${dupResult.unmarked} unmarked | ${dupResult.keysWithDuplicates} key groups`
        : `\n🔍 Duplicates: None found`;

    await sendSlackNotification(
      `✅ *Open Orders Re-Sync Completed* (${getCurrentISTTime()} IST)\n` +
        completionLines.join('\n') +
        dupSummary
    );
  } catch (error) {
    console.error('   ❌ Error during open orders re-sync:', error);
    await sendSlackNotification(`❌ *Open Orders Re-Sync Failed* (${getCurrentISTTime()} IST)\nError: ${error}`);
  }

  console.log('✓ Open Orders Re-Sync completed\n');
}

export type ScheduledJobId =
  | 'metrics-sync-12am'
  | 'metrics-sync-5am'
  | 'metrics-sync-10am'
  | 'metrics-sync-12pm'
  | 'metrics-sync-2pm'
  | 'metrics-sync-4pm'
  | 'metrics-sync-6pm'
  | 'metrics-sync-8pm'
  | 'metrics-sync-10pm'
  | 'queue-sync'
  | 'slack-alerts'
  | 'medonc-daily-alerts'
  | 'open-orders-summary'
  | 'dos-coverage-org'
  | 'retention-cleanup'
  | 'capacity-check'
  | 'open-orders-refresh'
  | 'astera-yesterday-unworked'
  | 'astera-denial-free-days'
  | 'astera-denial-internal'
  | 'astera-onco-notes-quality'
  | 'astera-dashboard-sync'
  | 'astera-assigned-unworked'
  | 'astera-query-return'
  | 'astera-wip-stale'
  | 'astera-authmate-pending';

const JOB_HANDLERS: Record<ScheduledJobId, () => Promise<void>> = {
  'metrics-sync-12am': () => runDailyMetricsSync(true),
  'metrics-sync-5am': () => runDailyMetricsSync(true),
  'metrics-sync-10am': () => runDailyMetricsSync(false),
  'metrics-sync-12pm': () => runDailyMetricsSync(false),
  'metrics-sync-2pm': () => runDailyMetricsSync(false),
  'metrics-sync-4pm': () => runDailyMetricsSync(false),
  'metrics-sync-6pm': () => runDailyMetricsSync(false),
  'metrics-sync-8pm': () => runDailyMetricsSync(false),
  'metrics-sync-10pm': () => runDailyMetricsSync(false),
  'queue-sync': runQueueDataSync,
  'slack-alerts': runSlackAlerts,
  'medonc-daily-alerts': runMedOncDailyAlerts,
  'open-orders-summary': runOpenOrdersSummaryJob,
  'dos-coverage-org': runDosCoverageOrgJob,
  'retention-cleanup': runRetentionCleanup,
  'capacity-check': runCapacityCheck,
  'open-orders-refresh': runOpenOrdersRefresh,
  'astera-yesterday-unworked': () => dispatchAsteraJob('astera-yesterday-unworked'),
  'astera-denial-free-days': () => dispatchAsteraJob('astera-denial-free-days'),
  'astera-denial-internal': () => dispatchAsteraJob('astera-denial-internal'),
  'astera-onco-notes-quality': () => dispatchAsteraJob('astera-onco-notes-quality'),
  'astera-dashboard-sync': () => dispatchAsteraJob('astera-dashboard-sync'),
  'astera-assigned-unworked': () => dispatchAsteraJob('astera-assigned-unworked'),
  'astera-query-return': () => dispatchAsteraJob('astera-query-return'),
  'astera-wip-stale': () => dispatchAsteraJob('astera-wip-stale'),
  'astera-authmate-pending': () => dispatchAsteraJob('astera-authmate-pending'),
};

export function isScheduledJobId(jobId: string): jobId is ScheduledJobId {
  return jobId in JOB_HANDLERS;
}

export async function runScheduledJobById(
  jobId: ScheduledJobId,
  options?: RunJobOptions
): Promise<void> {
  const handler = JOB_HANDLERS[jobId];
  if (!handler) {
    throw new Error(`Unknown job id: ${jobId}`);
  }
  activeJobOptions = options ?? {};
  try {
    await handler();
  } finally {
    activeJobOptions = {};
  }
}
