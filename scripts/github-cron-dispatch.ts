import 'dotenv/config';
import { CLOUD_SCHEDULER_JOBS } from '../src/cloud-scheduler-registry';
import {
  getCurrentISTTime,
  isScheduledJobId,
  runScheduledJobById,
  sendCronFailureNotification,
  sendCronSkipNotification,
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

/** Max jobs per scheduled GHA tick — prevents 90-min workflow timeout on backlog catch-up */
const MAX_JOBS_PER_DISPATCH = Number(process.env.CRON_MAX_JOBS_PER_DISPATCH ?? 4);

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

async function dispatchDueJobs(): Promise<{ ran: number; failed: string[] }> {
  console.log(`\n🔄 GitHub cron dispatch — IST ${getTodayIstDateKey()} ${getCurrentISTTime()}`);
  let ran = 0;
  const failed: string[] = [];
  const todayKey = getTodayIstDateKey();
  const yesterdayKey = getYesterdayIstDateKey();

  for (const job of CLOUD_SCHEDULER_JOBS) {
    if (ran >= MAX_JOBS_PER_DISPATCH) {
      console.log(`   ⏸ Reached cap of ${MAX_JOBS_PER_DISPATCH} jobs this tick — remaining catch-up on next run`);
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
      continue;
    }

    if (pastDueYesterday && (await hasJobCompletedOnDate(stateId, yesterdayKey))) {
      console.log(`   ↷ Skipping ${job.id} — already completed yesterday`);
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
  return { ran, failed };
}

async function main(): Promise<void> {
  const specificJob = process.argv[2]?.trim();

  if (specificJob) {
    console.log(`\n▶ Manual job run: ${specificJob}`);
    process.env.MANUAL_CRON_RUN = 'true';
    try {
      await runOneJob(specificJob, getTodayIstDateKey());
    } catch (error) {
      await sendCronFailureNotification(specificJob, error);
      throw error;
    }
    return;
  }

  const { failed } = await dispatchDueJobs();
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('GitHub cron dispatch failed:', error);
  process.exit(1);
});
