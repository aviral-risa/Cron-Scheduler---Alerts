/**
 * Utility functions for chart data transformation and formatting
 */

import type { OrgMetrics } from '../types/orders';
import { calcWorkedOfAssigned, calcWorkedOfLoaded } from './metrics';

/**
 * Chart data point for line chart
 */
export interface ChartDataPoint {
  timestamp: string; // Full timestamp: "2026-01-05 14:30:00"
  displayLabel: string; // Display label: "1/5 2P", "1/6 11A", etc.
  sortKey: number; // Timestamp as milliseconds for sorting
  workedOfAssigned: number | null; // % Worked of Assigned
  workedOfLoaded: number | null; // % Worked of Loaded
}

/**
 * Transform hourly metrics into chart-ready data
 * Uses actual sync timestamps to properly order data chronologically
 * X-axis: Date + Time labels (e.g., "1/5 6A", "1/6 11A")
 * Y-axis: Percentage values (0-100)
 */
export function prepareChartData(hourlyMetrics: OrgMetrics[]): ChartDataPoint[] {
  // Sort metrics by actual timestamp (chronologically)
  const sortedMetrics = [...hourlyMetrics].sort((a, b) => {
    const timeA = new Date(a.snapshot_timestamp).getTime();
    const timeB = new Date(b.snapshot_timestamp).getTime();
    return timeA - timeB;
  });

  // Transform each metric into a chart data point
  const chartData: ChartDataPoint[] = sortedMetrics.map((metrics) => {
    const timestamp = new Date(metrics.snapshot_timestamp);
    const sortKey = timestamp.getTime();
    const displayLabel = formatTimestampLabel(metrics.snapshot_timestamp);

    return {
      timestamp: metrics.snapshot_timestamp,
      displayLabel,
      sortKey,
      workedOfAssigned: calcWorkedOfAssigned(
        metrics.orders_worked,
        metrics.orders_assigned
      ),
      workedOfLoaded: calcWorkedOfLoaded(
        metrics.orders_worked,
        metrics.orders_loaded_today
      ),
    };
  });

  return chartData;
}

/**
 * Format hour with minutes as "06:00 AM", "02:30 PM", etc.
 */
export function formatHourLabel(hour: number, minute: number = 0): string {
  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');

  if (hour === 0) return `12:${minStr} AM`;
  if (hour < 12) return `${hourStr}:${minStr} AM`;
  if (hour === 12) return `12:${minStr} PM`;

  const pmHour = String(hour - 12).padStart(2, '0');
  return `${pmHour}:${minStr} PM`;
}

/**
 * Parse IST timestamp correctly
 * Input: "2026-01-05 14:30:00" or "2026-01-07 0:01:11" (IST time string)
 * Output: Date object
 */
function parseISTTimestamp(timestamp: string): Date {
  // IST timestamps from sheets are in format "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD H:mm:ss"
  // We need to parse them as IST (UTC+5:30)
  const [datePart, timePart] = timestamp.split(' ');

  if (!datePart || !timePart) {
    console.error('Invalid timestamp format:', timestamp);
    return new Date('Invalid');
  }

  // Normalize time part to ensure double-digit hours (0:01:11 → 00:01:11)
  const timeParts = timePart.split(':');
  if (timeParts.length === 3) {
    const [hour, minute, second] = timeParts;
    const normalizedTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;

    // Create ISO string with IST offset: +05:30
    const isoString = `${datePart}T${normalizedTime}+05:30`;
    return new Date(isoString);
  }

  // Fallback: try original format
  const isoString = `${datePart}T${timePart}+05:30`;
  return new Date(isoString);
}

/**
 * Format timestamp for chart X-axis labels
 * Input: "2026-01-05 14:30:00" (IST)
 * Output: "Jan 5, 02:30 PM" (Month Day, Hour:Min AM/PM)
 */
export function formatTimestampLabel(timestamp: string): string {
  const date = parseISTTimestamp(timestamp);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    console.error('Invalid timestamp:', timestamp);
    return 'Invalid';
  }

  // Format: "Jan 5, 02:30 PM"
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();

  const timeLabel = formatHourLabel(hour, minute);
  return `${month} ${day}, ${timeLabel}`;
}
