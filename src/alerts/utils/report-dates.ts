const IST = 'Asia/Kolkata';
const EST = 'America/New_York';

function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(ymd: string, delta: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function weekdayFromYmd(ymd: string, timeZone: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
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

/** Today's IST calendar date (YYYY-MM-DD). */
export function getTodayIstDate(reference = new Date()): string {
  return formatDateInZone(reference, IST);
}

/** Prior full IST calendar day (for denial notes). */
export function getPriorIstReportDate(reference = new Date()): string {
  const todayIst = formatDateInZone(reference, IST);
  return addDaysYmd(todayIst, -1);
}

/** Prior EST business day for AuthMate-Pending note checks. */
export function getPriorEstBusinessReportDate(reference = new Date()): string {
  let cursor = addDaysYmd(formatDateInZone(reference, EST), -1);

  while (weekdayFromYmd(cursor, EST) === 0 || weekdayFromYmd(cursor, EST) === 6) {
    cursor = addDaysYmd(cursor, -1);
  }

  return cursor;
}

/**
 * EST weekday to check for missed AuthMate followups.
 * Uses today when EST is Mon–Fri (11 PM IST run checks same EST calendar day).
 */
export function getAuthmateReportDate(reference = new Date()): string {
  const todayEst = formatDateInZone(reference, EST);
  const weekday = weekdayFromYmd(todayEst, EST);
  if (weekday !== 0 && weekday !== 6) {
    return todayEst;
  }
  return getPriorEstBusinessReportDate(reference);
}

/** Skip alert when EST yesterday was a weekend (no required weekday note). */
export function shouldRunAuthmatePendingAlert(reference = new Date()): boolean {
  const estYesterday = addDaysYmd(formatDateInZone(reference, EST), -1);
  const weekday = weekdayFromYmd(estYesterday, EST);
  return weekday !== 0 && weekday !== 6;
}
