/**
 * Timezone utility functions for IST (Indian Standard Time) conversion
 * IST is UTC+5:30
 */

/**
 * Convert a Date or ISO string to IST timestamp string
 * Format: "2026-01-03 10:56:00" (YYYY-MM-DD HH:MM:SS in IST)
 */
export function toISTTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Convert to IST by adding 5 hours and 30 minutes
  const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));

  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get IST date string from Date or ISO string
 * Format: "2026-01-03" (YYYY-MM-DD in IST)
 */
export function toISTDate(date: Date | string): string {
  const timestamp = toISTTimestamp(date);
  return timestamp.split(' ')[0];
}

/**
 * Get IST hour (0-23) from Date or ISO string
 */
export function toISTHour(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  return istDate.getUTCHours();
}

/**
 * Convert ISO string to IST timestamp or return empty string if null/undefined
 */
export function toISTTimestampOrEmpty(isoString: string | null | undefined): string {
  if (!isoString) return '';
  return toISTTimestamp(isoString);
}
