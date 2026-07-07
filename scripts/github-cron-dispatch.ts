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
  hasJobCompletedOnDate,
  markJobCompletedToday,
} from '../src/scheduler-job-state';
import {
  formatIstCronScheduleTime,
  isCronPastDueToday,
  isCronPastDueYesterday,
  isIstCronDueNow,
} from './cron-ist-utils';
import { shouldSkipAsteraJobForHoliday } from '../src/alerts/utils/astera-workday';

function githubJobStateId(jobId: string): string {
  return jobId.startsWith('astera-') ? jobId : `gha-${jobId}`;
}

async function runOneJob(jobId: string): Promise<void> {
  if (!isScheduledJobId(jobId)) {
    throw new Error(`Unknown job id: ${jobId}`);
  }
  if (await shouldSkipAsteraJobForHoliday(jobId)) {
    await markJobCompletedToday(githubJobStateId(jobId));
    await sendCronSkipNotification(jobId, 'holiday_skip');
    return;
  }
  await runScheduledJobById(jobId);
  if (!jobId.startsWith('astera-')) {
    await markJobCompletedToday(githubJobStateId(jobId));
  }
}

async function dispatchDueJobs(): Promise<number> {
  console.log(`\n🔄 GitHub cron dispatch — IST ${getTodayIstDateKey()} ${getCurrentISTTime()}`);
  let ran = 0;

  for (const job of CLOUD_SCHEDULER_JOBS) {
    const dueNow = isIstCronDueNow(job.schedule);
    const pastDueToday = !dueNow && isCronPastDueToday(job.schedule);
    const pastDueYesterday = !dueNow && !pastDueToday && isCronPastDueYesterday(job.schedule);
    const pastDueCatchUp = pastDueToday || pastDueYesterday;

    if (!dueNow && !pastDueCatchUp) {
      continue;
    }

    const stateId = githubJobStateId(job.id);
    const todayKey = getTodayIstDateKey();
    const yesterdayKey = getYesterdayIstDateKey();

    if (await hasJobCompletedOnDate(stateId, todayKey)) {
      console.log(`   ↷ Skipping ${job.id} — already completed today`);
      continue;
    }

    if (pastDueYesterday && (await hasJobCompletedOnDate(stateId, yesterdayKey))) {
      console.log(`   ↷ Skipping ${job.id} — already completed yesterday`);
      continue;
    }

    if (pastDueCatchUp) {
      const catchUpDay = pastDueYesterday ? yesterdayKey : todayKey;
      console.log(`   ↳ Catch-up ${job.id} (${catchUpDay}): ${job.description}`);
      await sendCronSkipNotification(job.id, 'catch_up_missed', {
        scheduledTime: formatIstCronScheduleTime(job.schedule),
        catchUpFor: catchUpDay,
      });
    } else {
      console.log(`   ▶ Running ${job.id}: ${job.description}`);
    }

    try {
      await runOneJob(job.id);
      ran += 1;
    } catch (error) {
      console.error(`   ❌ ${job.id} failed:`, error);
      await sendCronFailureNotification(job.id, error);
    }
  }

  console.log(ran === 0 ? '   ✓ No jobs due in this window\n' : `   ✓ Finished ${ran} job(s)\n`);
  return ran;
}

async function main(): Promise<void> {
  const specificJob = process.argv[2]?.trim();

  if (specificJob) {
    console.log(`\n▶ Manual job run: ${specificJob}`);
    process.env.MANUAL_CRON_RUN = 'true';
    try {
      await runOneJob(specificJob);
    } catch (error) {
      await sendCronFailureNotification(specificJob, error);
      throw error;
    }
    return;
  }

  await dispatchDueJobs();
}

main().catch((error) => {
  console.error('GitHub cron dispatch failed:', error);
  process.exit(1);
});
