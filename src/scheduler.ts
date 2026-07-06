import 'dotenv/config';
import cron from 'node-cron';
import {
  ASTERA_JOB_SPECS,
  catchUpMissedAsteraJobs,
  dispatchAsteraJob,
  getCurrentISTTime,
  runCapacityCheck,
  runDailyMetricsSync,
  runDosCoverageOrgJob,
  runMedOncDailyAlerts,
  runOpenOrdersRefresh,
  runOpenOrdersSummaryJob,
  runQueueDataSync,
  runRetentionCleanup,
  runSlackAlerts,
} from './scheduler-jobs';

/**
 * Local development scheduler (node-cron).
 *
 * ACTIVE RUNNER until GitHub Actions is configured and verified.
 * Production target: .github/workflows/account-mgmt-cron.yml
 *
 * Start: npm run scheduler
 */

console.log('='.repeat(70));
console.log('🕐 Account Management Dashboard - CRON Scheduler (local)');
console.log('='.repeat(70));
console.log(`   Current time: ${getCurrentISTTime()} IST`);
console.log('   Tip: deploy cloud cron with `npm run deploy:cron`');
console.log('');

const dailyMetricsSchedules = [
  { time: '12:00 AM', cron: '0 0 * * *', usePreviousDay: true, note: 'Previous day (if workday)' },
  { time: '05:00 AM', cron: '0 5 * * *', usePreviousDay: true, note: 'Previous day (if workday)' },
  { time: '10:00 AM', cron: '0 10 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '12:00 PM', cron: '0 12 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '02:00 PM', cron: '0 14 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '04:00 PM', cron: '0 16 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '06:00 PM', cron: '0 18 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '08:00 PM', cron: '0 20 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
  { time: '10:00 PM', cron: '0 22 * * *', usePreviousDay: false, note: 'Current day (if workday)' },
];

console.log('📊 Daily Metrics Sync Schedules:');
const metricsJobs: cron.ScheduledTask[] = [];
dailyMetricsSchedules.forEach((schedule) => {
  console.log(`   ✓ ${schedule.time} IST (${schedule.cron}) - ${schedule.note}`);
  const job = cron.schedule(
    schedule.cron,
    () => void runDailyMetricsSync(schedule.usePreviousDay),
    { timezone: 'Asia/Kolkata' }
  );
  metricsJobs.push(job);
});
console.log('');

console.log('📋 Queue View Sync Schedule:');
console.log('   ✓ 12:05 AM IST (5 0 * * *) - Previous day (if workday)');
const queueSyncJob = cron.schedule('5 0 * * *', () => void runQueueDataSync(), {
  timezone: 'Asia/Kolkata',
});

console.log('📢 Slack Alerts Schedule:');
console.log('   ✓ 10:00 PM IST (0 22 * * *) - Daily Performance Alerts');
const slackAlertsJob = cron.schedule('0 22 * * *', () => void runSlackAlerts(), {
  timezone: 'Asia/Kolkata',
});

console.log('📢 MedOnc Daily Alerts Schedule:');
console.log('   ✓ 09:00 AM IST (0 9 * * 1-5) - Mon-Fri');
const medoncDailyAlertsJob = cron.schedule('0 9 * * 1-5', () => void runMedOncDailyAlerts(), {
  timezone: 'Asia/Kolkata',
});

console.log('📋 Open Orders Summary Schedule:');
console.log('   ✓ 09:00 AM IST (0 9 * * 1-5) - Mon-Fri');
const openOrdersSummaryJob = cron.schedule('0 9 * * 1-5', () => void runOpenOrdersSummaryJob(), {
  timezone: 'Asia/Kolkata',
});

console.log('📋 DoS Coverage Org-Level Schedule:');
console.log('   ✓ 09:00 AM IST (0 9 * * 1-5) - Mon-Fri');
const dosCoverageOrgJob = cron.schedule('0 9 * * 1-5', () => void runDosCoverageOrgJob(), {
  timezone: 'Asia/Kolkata',
});

console.log('🗑️  Retention Policy Cleanup Schedule:');
console.log('   ✓ 03:00 AM IST (0 3 * * *)');
const retentionJob = cron.schedule('0 3 * * *', () => void runRetentionCleanup(), {
  timezone: 'Asia/Kolkata',
});

console.log('📊 Sheet Capacity Monitoring Schedule:');
console.log('   ✓ 09:00 AM IST (0 9 * * *)');
const capacityCheckJob = cron.schedule('0 9 * * *', () => void runCapacityCheck(), {
  timezone: 'Asia/Kolkata',
});

console.log('🔄 Open Orders Re-Sync Schedule:');
console.log('   ✓ 05:00 AM IST (0 5 * * 1-5) - Mon-Fri');
const openOrdersRefreshJob = cron.schedule('0 5 * * 1-5', () => void runOpenOrdersRefresh(), {
  timezone: 'Asia/Kolkata',
});

console.log('📢 Astera Radiology Alert Schedule:');
ASTERA_JOB_SPECS.forEach((spec) => {
  const hh = String(spec.hour).padStart(2, '0');
  const mm = String(spec.minute).padStart(2, '0');
  console.log(`   ✓ ${hh}:${mm} — ${spec.label}`);
});

const asteraYesterdayUnworkedJob = cron.schedule(
  '30 15 * * *',
  () => void dispatchAsteraJob('astera-yesterday-unworked'),
  { timezone: 'Asia/Kolkata' }
);
const asteraDenialAlertsJob = cron.schedule(
  '0 16 * * *',
  () => void dispatchAsteraJob('astera-denial-internal'),
  { timezone: 'Asia/Kolkata' }
);
const asteraDashboardSyncJob = cron.schedule(
  '0 11 * * *',
  () => void dispatchAsteraJob('astera-dashboard-sync'),
  { timezone: 'Asia/Kolkata' }
);
const asteraAssignedUnworkedJob = cron.schedule(
  '0 17 * * *',
  () => void dispatchAsteraJob('astera-assigned-unworked'),
  { timezone: 'Asia/Kolkata' }
);
const asteraQueryReturnJob = cron.schedule(
  '15 17 * * *',
  () => void dispatchAsteraJob('astera-query-return'),
  { timezone: 'Asia/Kolkata' }
);
const asteraWipStaleJob = cron.schedule(
  '0 22 * * *',
  () => void dispatchAsteraJob('astera-wip-stale'),
  { timezone: 'Asia/Kolkata' }
);
const asteraAuthmatePendingJob = cron.schedule(
  '0 23 * * *',
  () => void dispatchAsteraJob('astera-authmate-pending'),
  { timezone: 'Asia/Kolkata' }
);

console.log('');
console.log('='.repeat(70));
console.log('✅ All schedulers initialized successfully!');
console.log('   Press Ctrl+C to stop the scheduler');
console.log('='.repeat(70));
console.log('');

void catchUpMissedAsteraJobs().catch((error) => {
  console.error('❌ Astera catch-up failed:', error);
});

function stopAllJobs() {
  console.log('\n🛑 Shutting down all schedulers...');
  metricsJobs.forEach((job) => job.stop());
  queueSyncJob.stop();
  slackAlertsJob.stop();
  medoncDailyAlertsJob.stop();
  openOrdersSummaryJob.stop();
  dosCoverageOrgJob.stop();
  retentionJob.stop();
  capacityCheckJob.stop();
  openOrdersRefreshJob.stop();
  asteraYesterdayUnworkedJob.stop();
  asteraDenialAlertsJob.stop();
  asteraDashboardSyncJob.stop();
  asteraAssignedUnworkedJob.stop();
  asteraQueryReturnJob.stop();
  asteraWipStaleJob.stop();
  asteraAuthmatePendingJob.stop();
  console.log('✓ All schedulers stopped');
  process.exit(0);
}

process.on('SIGINT', stopAllJobs);
process.on('SIGTERM', stopAllJobs);

setInterval(() => {
  console.log(`💓 Scheduler heartbeat — ${getCurrentISTTime()} IST`);
}, 60 * 60 * 1000);
