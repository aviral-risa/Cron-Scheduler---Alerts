import dotenv from 'dotenv';
dotenv.config({ override: true });

import { executeRadiologyJob, radiologyLog } from '../src/radiology-cron-engine';
import { resolveRadiologyJobFromUtcCron } from '../src/radiology-scheduler-registry';
import type { ScheduledJobId } from '../src/scheduler-jobs';

function resolveJobId(): ScheduledJobId {
  const cliJob = process.argv[2]?.trim();
  if (cliJob) {
    return cliJob as ScheduledJobId;
  }

  const utcCron = process.env.GHA_SCHEDULE_CRON?.trim();
  if (utcCron) {
    const mapped = resolveRadiologyJobFromUtcCron(utcCron);
    if (mapped) {
      return mapped;
    }
    radiologyLog('RESOLVE_FAIL', { utcCron, error: 'no_job_for_cron' });
    throw new Error(`No radiology job mapped for UTC cron: ${utcCron}`);
  }

  throw new Error('Usage: run-radiology-job.ts <job-id>  OR set GHA_SCHEDULE_CRON');
}

async function main(): Promise<void> {
  const force = process.env.MANUAL_CRON_RUN === 'true' || process.argv.includes('--force');
  const jobId = resolveJobId();

  const report = await executeRadiologyJob(jobId, {
    force,
    githubRunId: process.env.GITHUB_RUN_ID,
    githubEvent: process.env.GITHUB_EVENT_NAME,
    utcCron: process.env.GHA_SCHEDULE_CRON,
  });

  radiologyLog('DONE', { jobId, status: report.status, durationMs: report.durationMs });

  if (report.status === 'failed') {
    process.exit(1);
  }
}

main().catch((error) => {
  radiologyLog('FATAL', { error: error instanceof Error ? error.message : String(error) });
  console.error(error);
  process.exit(1);
});
