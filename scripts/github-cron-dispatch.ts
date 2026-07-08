import 'dotenv/config';
import { CLOUD_SCHEDULER_JOBS } from '../src/cloud-scheduler-registry';
import { MEDONC_SCHEDULER_JOBS } from '../src/medonc-scheduler-registry';
import { RADIOLOGY_SCHEDULER_JOBS } from '../src/radiology-scheduler-registry';
import type { CloudSchedulerJobDef } from '../src/cloud-scheduler-registry';
import {
  getCurrentISTTime,
  isScheduledJobId,
  runScheduledJobById,
  sendCronFailureNotification,
  sendCronSkipNotification,
  sendTestAlertsMessage,
  type ScheduledJobId,
} from '../src/scheduler-jobs';
import {
  getTodayIstDateKey,
  getYesterdayIstDateKey,
  hasCatchUpNotified,
  hasJobCompletedOnDate,
  markCatchUpNotified,
  markJobCompletedOnDate,
} from '../src/scheduler-job-state';
import {
  formatIstCronScheduleTime,
  isCronMissedForYesterday,
  isCronPastDueToday,
  isIstCronDueNow,
} from './cron-ist-utils';
import { shouldSkipAsteraJobForHoliday } from '../src/alerts/utils/astera-workday';
import { takeJobOutcome } from '../src/cron-job-outcome';

const MAX_JOBS_PER_DISPATCH = Number(process.env.CRON_MAX_JOBS_PER_DISPATCH ?? 4);

function resolveJobRegistry(): CloudSchedulerJobDef[] {
  const registry = process.env.CRON_REGISTRY?.toLowerCase();
  if (registry === 'radiology') {
    return RADIOLOGY_SCHEDULER_JOBS;
  }
  if (registry === 'medonc') {
    return MEDONC_SCHEDULER_JOBS;
  }
  return CLOUD_SCHEDULER_JOBS;
}

function githubJobStateId(jobId: string): string {
  return jobId.startsWith('astera-') ? jobId : `gha-${jobId}`;
}

async function runOneJob(jobId: string, completionDateKey: string): Promise<void> {
  if (!isScheduledJobId(jobId)) {
    throw new Error(`Unknown job id: ${jobId}`);
  }
  const stateId = githubJobStateId(jobId);
  if (await shouldSkipAsteraJobForHoliday(jobId)) {
    await markJobCompletedOnDate(stateId, completionDateKey);
    await sendCronSkipNotification(jobId, 'holiday_skip');
    return;
  }
  await runScheduledJobById(jobId, { completionDateKey });
  if (!jobId.startsWith('astera-')) {
    await markJobCompletedOnDate(stateId, completionDateKey);
  }
}

async function dispatchDueJobs(): Promise<{
  ran: number;
  failed: string[];
  skipped: string[];
  registry: string;
}> {
  const jobs = resolveJobRegistry();
  const registry = process.env.CRON_REGISTRY ?? 'all';
  console.log(`\n🔄 GitHub cron dispatch [${registry}] — IST ${getTodayIstDateKey()} ${getCurrentISTTime()}`);
  let ran = 0;
  const failed: string[] = [];
  const skipped: string[] = [];
  const todayKey = getTodayIstDateKey();
  const yesterdayKey = getYesterdayIstDateKey();

  for (const job of jobs) {
    if (ran >= MAX_JOBS_PER_DISPATCH) {
      console.log(`   ⏸ Reached cap of ${MAX_JOBS_PER_DISPATCH} jobs this tick`);
      break;
    }

    const dueNow = isIstCronDueNow(job.schedule);
    const pastDueToday = !dueNow && isCronPastDueToday(job.schedule);
    const pastDueYesterday = !dueNow && !pastDueToday && isCronMissedForYesterday(job.schedule);
    const pastDueCatchUp = pastDueToday || pastDueYesterday;

    if (!dueNow && !pastDueCatchUp) {
      continue;
    }

    const stateId = githubJobStateId(job.id);
    const completionDateKey = pastDueYesterday ? yesterdayKey : todayKey;

    if (await hasJobCompletedOnDate(stateId, completionDateKey)) {
      console.log(`   ↷ Skipping ${job.id} — already completed for ${completionDateKey}`);
      skipped.push(job.id);
      continue;
    }

    if (pastDueYesterday && (await hasJobCompletedOnDate(stateId, yesterdayKey))) {
      console.log(`   ↷ Skipping ${job.id} — already completed yesterday`);
      skipped.push(job.id);
      continue;
    }

    if (pastDueCatchUp) {
      const catchUpDay = pastDueYesterday ? yesterdayKey : todayKey;
      console.log(`   ↳ Catch-up ${job.id} (${catchUpDay}): ${job.description}`);
      if (!(await hasCatchUpNotified(stateId, catchUpDay))) {
        await sendCronSkipNotification(job.id, 'catch_up_missed', {
          scheduledTime: formatIstCronScheduleTime(job.schedule),
          catchUpFor: catchUpDay,
        });
        await markCatchUpNotified(stateId, catchUpDay);
      }
    } else {
      console.log(`   ▶ Running ${job.id}: ${job.description}`);
    }

    try {
      await runOneJob(job.id, completionDateKey);
      ran += 1;
    } catch (error) {
      console.error(`   ❌ ${job.id} failed:`, error);
      failed.push(job.id);
      await sendCronFailureNotification(job.id, error);
    }
  }

  console.log(
    failed.length === 0
      ? ran === 0
        ? '   ✓ No jobs due in this window\n'
        : `   ✓ Finished ${ran} job(s)\n`
      : `   ⚠ Finished ${ran} job(s), ${failed.length} failed: ${failed.join(', ')}\n`
  );
  return { ran, failed, skipped, registry };
}

async function postDispatchSummary(result: {
  ran: number;
  failed: string[];
  skipped: string[];
  registry: string;
  jobId?: string;
}): Promise<void> {
  const outcome = takeJobOutcome();
  const lines = [
    `*Cron dispatch summary* [${result.registry}] (${getCurrentISTTime()} IST)`,
    result.jobId ? `Manual job: \`${result.jobId}\`` : '',
    result.ran > 0 ? `✅ Ran: ${result.ran} job(s)` : 'ℹ️ Ran: 0 jobs',
    outcome ? `📋 ${outcome}` : '',
    result.failed.length > 0 ? `❌ Failed: ${result.failed.join(', ')}` : '',
    result.skipped.length > 0 ? `↷ Skipped (already done): ${result.skipped.join(', ')}` : '',
    !outcome && result.ran > 0 && result.jobId?.startsWith('astera-')
      ? '_Job finished — check #astera-radiology for post._'
      : '',
    result.ran === 0 && result.failed.length === 0 && result.skipped.length === 0
      ? '_No jobs were due this window — check registry/schedule._'
      : '',
  ].filter(Boolean);
  await sendTestAlertsMessage(lines.join('\n'));
}

async function main(): Promise<void> {
  const specificJob = process.argv[2]?.trim();

  if (specificJob) {
    console.log(`\n▶ Manual job run: ${specificJob}`);
    process.env.MANUAL_CRON_RUN = 'true';
    try {
      await runOneJob(specificJob, getTodayIstDateKey());
      await postDispatchSummary({
        ran: 1,
        failed: [],
        skipped: [],
        registry: process.env.CRON_REGISTRY ?? 'all',
        jobId: specificJob,
      });
    } catch (error) {
      await sendCronFailureNotification(specificJob, error);
      await postDispatchSummary({
        ran: 0,
        failed: [specificJob],
        skipped: [],
        registry: process.env.CRON_REGISTRY ?? 'all',
        jobId: specificJob,
      });
      throw error;
    }
    return;
  }

  const result = await dispatchDueJobs();
  await postDispatchSummary({ ...result, registry: process.env.CRON_REGISTRY ?? 'all' });
  if (result.failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('GitHub cron dispatch failed:', error);
  process.exit(1);
});
