import { addDaysYmd, getTodayIstDate } from './report-dates';
import { getIstMinutesSinceMidnight } from '../../scheduler-job-state';
import { ASTERA_BQ_SQL_FILES, ASTERA_RADIOLOGY_ORG_ID } from '../config/astera-bq-alerts.config';
import { runBqAlertQuery } from './bq-query-loader';
import type { ScheduledJobId } from '../../scheduler-jobs';
import { CLOUD_SCHEDULER_JOBS } from '../../cloud-scheduler-registry';

const IST = 'Asia/Kolkata';

export interface IstDayAllotment {
  cases_added: number;
  allotted_cases_pct: number;
}

const allotmentCache = new Map<string, IstDayAllotment>();

function weekdayFromYmd(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    weekday: 'short',
  }).format(noonUtc);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function isIstWeekendYmd(ymd: string): boolean {
  const dow = weekdayFromYmd(ymd);
  return dow === 0 || dow === 6;
}

export async function fetchIstDayAllotment(istDate: string): Promise<IstDayAllotment> {
  const cached = allotmentCache.get(istDate);
  if (cached) {
    return cached;
  }

  const rows = await runBqAlertQuery<{
    cases_added: number;
    allotted_cases_pct: number | null;
  }>(ASTERA_BQ_SQL_FILES.dailySummaryMetrics, {
    report_date: istDate,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });

  const row = rows[0];
  const result: IstDayAllotment = {
    cases_added: row?.cases_added ?? 0,
    allotted_cases_pct: row?.allotted_cases_pct ?? 0,
  };
  allotmentCache.set(istDate, result);
  return result;
}

/** IST day with cases added and >0% allotted (staff actively working).
 *  BigQuery alert SQL mirrors this via staff_working_days CTE — see
 *  sql/bigquery/fragments/astera-ist-staff-working-days-cte.sql */
export async function isIstStaffWorkingDay(istDate: string): Promise<boolean> {
  if (isIstWeekendYmd(istDate)) {
    return false;
  }
  const { cases_added, allotted_cases_pct } = await fetchIstDayAllotment(istDate);
  return cases_added > 0 && allotted_cases_pct > 0;
}

export async function isTodayIstHoliday(reference = new Date()): Promise<boolean> {
  return !(await isIstStaffWorkingDay(getTodayIstDate(reference)));
}

/** Last IST date before today with >0% allotment (skips weekends and holidays). */
export async function getPriorIstWorkingReportDate(
  reference = new Date(),
  maxLookback = 21
): Promise<string> {
  let cursor = addDaysYmd(getTodayIstDate(reference), -1);

  for (let i = 0; i < maxLookback; i++) {
    if (await isIstStaffWorkingDay(cursor)) {
      return cursor;
    }
    cursor = addDaysYmd(cursor, -1);
  }

  return cursor;
}

function parseScheduledHourIst(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  return parseInt(parts[1] ?? '0', 10);
}

export function getAsteraJobScheduledHourIst(jobId: ScheduledJobId): number | null {
  const job = CLOUD_SCHEDULER_JOBS.find((j) => j.id === jobId);
  if (!job || !jobId.startsWith('astera-')) {
    return null;
  }
  return parseScheduledHourIst(job.schedule);
}

/** Astera jobs at/after 7 PM IST skip when today IST is a holiday (0% allotted). */
export async function shouldSkipAsteraJobForHoliday(
  jobId: ScheduledJobId,
  reference = new Date()
): Promise<boolean> {
  if (!jobId.startsWith('astera-')) {
    return false;
  }

  const scheduledHour = getAsteraJobScheduledHourIst(jobId);
  if (scheduledHour === null || scheduledHour < 19) {
    return false;
  }

  if (await isTodayIstHoliday(reference)) {
    console.log(
      `ℹ️ Skipping ${jobId} — today IST (${getTodayIstDate(reference)}) is a staff holiday (0% allotted)`
    );
    return true;
  }

  return false;
}

export function isAfter7pmIst(reference = new Date()): boolean {
  return getIstMinutesSinceMidnight(reference) >= 19 * 60;
}
