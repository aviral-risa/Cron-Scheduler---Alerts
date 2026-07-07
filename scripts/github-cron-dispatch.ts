import 'dotenv/config';
import { CLOUD_SCHEDULER_JOBS } from '../src/cloud-scheduler-registry';
import {
  getCurrentISTTime,
  isScheduledJobId,
  runScheduledJobById,
  sendCronSkipNotification,
  type ScheduledJobId,
} from '../src/scheduler-jobs';
import {
  getTodayIstDateKey,
  hasJobCompletedToday,
  markJobCompletedToday,
} from '../src/scheduler-job-state';
import {
  formatIstCronScheduleTime,
  isCronPastDueToday,
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
    const pastDueCatchUp = !dueNow && isCronPastDueToday(job.schedule);

    if (!dueNow && !pastDueCatchUp) {
      continue;
    }

    const stateId = githubJobStateId(job.id);
    if (await hasJobCompletedToday(stateId)) {
      console.log(`   ↷ Skipping ${job.id} — already completed today`);
      await sendCronSkipNotification(job.id, 'already_completed_today');
      continue;
    }

    if (pastDueCatchUp) {
      console.log(`   ↳ Catch-up ${job.id}: ${job.description}`);
      await sendCronSkipNotification(job.id, 'catch_up_missed', {
        scheduledTime: formatIstCronScheduleTime(job.schedule),
      });
    } else {
      console.log(`   ▶ Running ${job.id}: ${job.description}`);
    }

    await runOneJob(job.id);
    ran += 1;
  }

  console.log(ran === 0 ? '   ✓ No jobs due in this window\n' : `   ✓ Finished ${ran} job(s)\n`);
  return ran;
}

async function main(): Promise<void> {
  const specificJob = process.argv[2]?.trim();

  if (specificJob) {
    console.log(`\n▶ Manual job run: ${specificJob}`);
    await runOneJob(specificJob);
    return;
  }

  await dispatchDueJobs();
}

main().catch((error) => {
  console.error('GitHub cron dispatch failed:', error);
  process.exit(1);
});
