/**
 * Parse IST cron fields (minute hour dom month dow) and check if job is due
 * within the current dispatch window (default 14 minutes).
 */
import { getIstMinutesSinceMidnight } from '../src/scheduler-job-state';

function getIstDayOfWeek(reference = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(reference);
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

function matchesDayOfWeek(dowField: string, dow: number): boolean {
  if (dowField === '*') {
    return true;
  }
  for (const part of dowField.split(',')) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((v) => parseInt(v, 10));
      if (dow >= start && dow <= end) {
        return true;
      }
    } else if (parseInt(part, 10) === dow) {
      return true;
    }
  }
  return false;
}

export function isIstCronDueNow(
  schedule: string,
  reference = new Date(),
  windowMinutes = 14
): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) {
    return false;
  }

  const [minuteStr, hourStr, , , dowStr] = parts;
  const minute = parseInt(minuteStr, 10);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) {
    return false;
  }

  const dow = getIstDayOfWeek(reference);
  if (!matchesDayOfWeek(dowStr, dow)) {
    return false;
  }

  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = getIstMinutesSinceMidnight(reference);
  const diff = nowMinutes - scheduledMinutes;
  return diff >= 0 && diff < windowMinutes;
}
