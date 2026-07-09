import dotenv from 'dotenv';
dotenv.config({ override: true });

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
const IS_RADIOLOGY = process.env.CRON_REGISTRY?.toLowerCase() === 'radiology';

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
  await markJobCompletedOnDate(stateId, completionDateKey);
}

interface DueJob {
  job: CloudSchedulerJobDef;
  dueNow: boolean;
  pastDueCatchUp: boolean;
  completionDateKey: string;
}

function collectDueJobs(
  jobs: CloudSchedulerJobDef[],
  todayKey: string,
  yesterdayKey: string
): DueJob[] {
  const due: DueJob[] = [];

  for (const job of jobs) {
    const dueNow = isIstCronDueNow(job.schedule);
    const pastDueToday = !dueNow && isCronPastDueToday(job.schedule);
    const pastDueYesterday = !dueNow && !pastDueToday && isCronMissedForYesterday(job.schedule);
    const pastDueCatchUp = pastDueToday || pastDueYesterday;

    // Radiology: only fire in the scheduled 14-minute window — no all-day catch-up storm.
    if (IS_RADIOLOGY && !dueNow) {
      continue;
    }

    if (!dueNow && !pastDueCatchUp) {
      continue;
    }

    due.push({
      job,
      dueNow,
      pastDueCatchUp,
      completionDateKey: pastDueYesterday ? yesterdayKey : todayKey,
    });
  }

  // Prefer on-time jobs, then earlier schedule (dashboard before alerts).
  due.sort((a, b) => {
    if (a.dueNow !== b.dueNow) {
      return a.dueNow ? -1 : 1;
    }
    const [aMin, aHour] = a.job.schedule.split(/\s+/).slice(0, 2).map(Number);
    const [bMin, bHour] = b.job.schedule.split(/\s+/).slice(0, 2).map(Number);
    return aHour * 60 + aMin - (bHour * 60 + bMin);
  });

  return due;
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
  let attempts = 0;
  const failed: string[] = [];
  const skipped: string[] = [];
  const todayKey = getTodayIstDateKey();
  const yesterdayKey = getYesterdayIstDateKey();

  const dueJobs = collectDueJobs(jobs, todayKey, yesterdayKey);

  for (const entry of dueJobs) {
    if (attempts >= MAX_JOBS_PER_DISPATCH) {
      console.log(`   ⏸ Reached cap of ${MAX_JOBS_PER_DISPATCH} job attempt(s) this tick`);
      break;
    }

    const { job, pastDueCatchUp, completionDateKey } = entry;
    const stateId = githubJobStateId(job.id);

    if (await hasJobCompletedOnDate(stateId, completionDateKey)) {
      console.log(`   ↷ Skipping ${job.id} — already completed for ${completionDateKey}`);
      skipped.push(job.id);
      continue;
    }

    if (pastDueCatchUp) {
      const catchUpDay = completionDateKey;
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

    attempts += 1;
    try {
      await runOneJob(job.id, completionDateKey);
      ran += 1;
      if (IS_RADIOLOGY || ran >= MAX_JOBS_PER_DISPATCH) {
        break;
      }
    } catch (error) {
      console.error(`   ❌ ${job.id} failed:`, error);
      failed.push(job.id);
      await sendCronFailureNotification(job.id, error);
      if (IS_RADIOLOGY) {
        break; // Do not cascade to other jobs when one fails
      }
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
      ? '_No jobs due in this window — check registry/schedule._'
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
}

main().catch((error) => {
  console.error('GitHub cron dispatch failed:', error);
  process.exit(1);
});
