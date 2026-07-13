/**
 * Radiology cron engine — single-job runner with structured logs and Slack ops report.
 * Used exclusively by radiology-cron.yml (not the 15-minute medonc dispatcher).
 */
import {
  dispatchAsteraJob,
  getCurrentISTTime,
  isManualCronRun,
  isScheduledJobId,
  sendCronFailureNotification,
  sendTestAlertsMessage,
  type ScheduledJobId,
} from './scheduler-jobs';
import {
  getTodayIstDateKey,
  hasJobCompletedOnDate,
} from './scheduler-job-state';
import { getRadiologySchedule } from './radiology-scheduler-registry';
import { takeJobOutcome } from './cron-job-outcome';

export type RadiologyRunStatus = 'success' | 'skipped' | 'failed';

export interface RadiologyRunReport {
  jobId: ScheduledJobId;
  status: RadiologyRunStatus;
  istDateKey: string;
  istTime: string;
  durationMs: number;
  scheduledIst?: string;
  description?: string;
  reason?: string;
  alertOutcome?: string;
  githubRunId?: string;
  githubEvent?: string;
  utcCron?: string;
}

export function radiologyLog(
  phase: string,
  fields: Record<string, unknown> = {}
): void {
  const line = {
    radiology_cron: true,
    phase,
    ts_utc: new Date().toISOString(),
    ts_ist: getCurrentISTTime(),
    ...fields,
  };
  console.log(JSON.stringify(line));
}

export async function executeRadiologyJob(
  jobId: string,
  meta: {
    githubRunId?: string;
    githubEvent?: string;
    utcCron?: string;
    force?: boolean;
  } = {}
): Promise<RadiologyRunReport> {
  const started = Date.now();
  const istDateKey = getTodayIstDateKey();
  const schedule = isScheduledJobId(jobId) ? getRadiologySchedule(jobId) : undefined;

  radiologyLog('BOOT', {
    jobId,
    istDateKey,
    force: meta.force ?? false,
    githubRunId: meta.githubRunId,
    githubEvent: meta.githubEvent,
    utcCron: meta.utcCron,
    scheduledIst: schedule?.istTime,
    description: schedule?.description,
  });

  if (!isScheduledJobId(jobId)) {
    const report: RadiologyRunReport = {
      jobId: jobId as ScheduledJobId,
      status: 'failed',
      istDateKey,
      istTime: getCurrentISTTime(),
      durationMs: Date.now() - started,
      reason: `Unknown job id: ${jobId}`,
      ...pickMeta(meta, schedule),
    };
    radiologyLog('FAILED', report);
    await postRadiologyRunReport(report);
    return report;
  }

  if (meta.force) {
    process.env.MANUAL_CRON_RUN = 'true';
  }

  const completedBefore = await hasJobCompletedOnDate(jobId, istDateKey);
  radiologyLog('STATE', { jobId, istDateKey, completedBefore, manual: isManualCronRun() });

  if (completedBefore && !isManualCronRun()) {
    const report: RadiologyRunReport = {
      jobId,
      status: 'skipped',
      istDateKey,
      istTime: getCurrentISTTime(),
      durationMs: Date.now() - started,
      reason: 'already_completed_today',
      ...pickMeta(meta, schedule),
    };
    radiologyLog('SKIP', report);
    await postRadiologyRunReport(report);
    return report;
  }

  radiologyLog('EXECUTE_START', { jobId });

  try {
    await dispatchAsteraJob(jobId);
    const completedAfter = await hasJobCompletedOnDate(jobId, istDateKey);
    const alertOutcome = takeJobOutcome();

    const report: RadiologyRunReport = {
      jobId,
      status: completedAfter || isManualCronRun() ? 'success' : 'skipped',
      istDateKey,
      istTime: getCurrentISTTime(),
      durationMs: Date.now() - started,
      alertOutcome,
      reason: completedAfter ? undefined : 'completed_without_state_mark',
      ...pickMeta(meta, schedule),
    };

    radiologyLog('EXECUTE_OK', report);
    await postRadiologyRunReport(report);
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report: RadiologyRunReport = {
      jobId,
      status: 'failed',
      istDateKey,
      istTime: getCurrentISTTime(),
      durationMs: Date.now() - started,
      reason: message,
      ...pickMeta(meta, schedule),
    };
    radiologyLog('EXECUTE_FAIL', report);
    await sendCronFailureNotification(jobId, error);
    await postRadiologyRunReport(report);
    return report;
  } finally {
    delete process.env.MANUAL_CRON_RUN;
  }
}

function pickMeta(
  meta: { githubRunId?: string; githubEvent?: string; utcCron?: string },
  schedule?: { istTime: string; description: string }
): Pick<RadiologyRunReport, 'githubRunId' | 'githubEvent' | 'utcCron' | 'scheduledIst' | 'description'> {
  return {
    githubRunId: meta.githubRunId,
    githubEvent: meta.githubEvent,
    utcCron: meta.utcCron,
    scheduledIst: schedule?.istTime,
    description: schedule?.description,
  };
}

async function postRadiologyRunReport(report: RadiologyRunReport): Promise<void> {
  const statusEmoji =
    report.status === 'success' ? '✅' : report.status === 'skipped' ? '↷' : '❌';

  const lines = [
    `*Radiology cron* ${statusEmoji} \`${report.jobId}\``,
    `_${report.istTime} IST · ${report.istDateKey}_`,
    report.scheduledIst ? `Scheduled: ${report.scheduledIst} IST` : '',
    report.description ? `_${report.description}_` : '',
    `Status: *${report.status.toUpperCase()}* (${(report.durationMs / 1000).toFixed(1)}s)`,
    report.reason ? `Reason: ${report.reason}` : '',
    report.alertOutcome ? `📋 ${report.alertOutcome}` : '',
    report.githubRunId
      ? `<https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${report.githubRunId}|GHA run ${report.githubRunId}>`
      : '',
  ].filter(Boolean);

  await sendTestAlertsMessage(lines.join('\n'));
}
