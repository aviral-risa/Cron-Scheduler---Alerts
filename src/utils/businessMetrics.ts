/**
 * Business Metrics Calculation Utilities
 * Functions for calculating approval rates, authorization rates, and aggregating data
 */

import type { DailySummary, WorkingDayConfig, BusinessMetricsDaily } from '../types/orders';
import type { BusinessMetrics, DailyCount } from '../types/business';
import { isWeekend } from 'date-fns';

/**
 * Get billable orders count from a summary row.
 * Uses total_billable_orders for BusinessMetricsDaily, falls back to orders_completed for DailySummary.
 */
function getBillableOrders(summary: DailySummary | BusinessMetricsDaily): number {
  if ('total_billable_orders' in summary) {
    return summary.total_billable_orders;
  }
  return summary.orders_completed;
}

/**
 * Calculate approval rate
 * Measures success rate of newly initiated authorizations
 * @returns (Auth by Risa) / (Auth by Risa + Denial by Risa) * 100
 */
export function calculateApprovalRate(
  authByRisa: number,
  denialByRisa: number
): number | null {
  const total = authByRisa + denialByRisa;
  if (total === 0) return null;
  return parseFloat(((authByRisa / total) * 100).toFixed(1));
}

/**
 * Calculate authorization rate
 * Percentage of completed auth-related orders that were authorized
 * @returns (Auth by RISA + NAR + Auth on File) / (Auth + NAR + Auth on File + Denials) * 100
 */
export function calculateAuthorizationRate(
  authByRisa: number,
  authOnFile: number,
  noAuthRequired: number,
  denialByRisa: number,
  denialAfterQuery: number
): number | null {
  const totalAuthorized = authByRisa + authOnFile + noAuthRequired;
  const totalDenied = denialByRisa + denialAfterQuery;
  const total = totalAuthorized + totalDenied;

  if (total === 0) return null;
  return (totalAuthorized / total) * 100;
}

/**
 * Filter daily summaries by working days
 * @param summaries - Array of daily summaries or business metrics
 * @param workingDayConfigs - Working day configs from sheets
 * @param includeWeekends - Whether to include weekends
 * @returns Filtered array of summaries
 */
export function filterByWorkingDays(
  summaries: (DailySummary | BusinessMetricsDaily)[],
  workingDayConfigs: WorkingDayConfig[],
  includeWeekends: boolean
): (DailySummary | BusinessMetricsDaily)[] {
  if (includeWeekends) {
    // Include all days
    return summaries;
  }

  // Create a map of dates with explicit config
  const configMap = new Map<string, boolean>();
  workingDayConfigs.forEach((config) => {
    configMap.set(config.date, config.is_working_day);
  });

  // Filter summaries
  return summaries.filter((summary) => {
    const date = summary.created_at_date;

    // Check if date has explicit config
    if (configMap.has(date)) {
      return configMap.get(date);
    }

    // Default: exclude weekends
    const dateObj = new Date(date + 'T00:00:00');
    return !isWeekend(dateObj);
  });
}

/**
 * Aggregate daily summaries into business metrics
 * @param summaries - Array of daily summaries or business metrics (already filtered)
 * @param allDates - All dates in the range for trend calculation
 * @param startDate - Start date of range
 * @param endDate - End date of range
 * @param organizationIds - Selected organization IDs
 * @returns Aggregated business metrics
 */
export function aggregateDailySummaries(
  summaries: (DailySummary | BusinessMetricsDaily)[],
  allDates: string[],
  startDate: string,
  endDate: string,
  organizationIds: string[]
): BusinessMetrics {
  // Initialize aggregated values
  let totalOrdersLoaded = 0;
  let totalOrdersAssigned = 0;
  let totalOrdersWorked = 0;
  let authByRisa = 0;
  let authOnFile = 0;
  let noAuthRequired = 0;
  let denialByRisa = 0;
  let denialAfterQuery = 0;
  let existingDenial = 0;
  let query = 0;
  let pending = 0;
  let hold = 0;
  let authRequired = 0;
  let other = 0;

  // Aggregate across all summaries
  summaries.forEach((summary) => {
    totalOrdersLoaded += summary.total_orders;
    totalOrdersAssigned += summary.orders_assigned;
    totalOrdersWorked += getBillableOrders(summary);
    authByRisa += summary.status_auth_by_risa;
    authOnFile += summary.status_auth_on_file;
    noAuthRequired += summary.status_no_auth_required;
    denialByRisa += summary.status_denial_by_risa;
    denialAfterQuery += summary.status_denial_after_query;
    existingDenial += summary.status_existing_denial;
    query += summary.status_query;
    pending += summary.status_pending;
    hold += summary.status_hold;
    authRequired += summary.status_auth_required;
    other += summary.status_other;
  });

  // Calculate metrics
  const approvalRate = calculateApprovalRate(authByRisa, denialByRisa);
  const authorizationRate = calculateAuthorizationRate(
    authByRisa,
    authOnFile,
    noAuthRequired,
    denialByRisa,
    denialAfterQuery
  );

  // Group summaries by date for trend calculation
  const summariesByDate = new Map<string, (DailySummary | BusinessMetricsDaily)[]>();
  summaries.forEach((summary) => {
    const date = summary.created_at_date;
    if (!summariesByDate.has(date)) {
      summariesByDate.set(date, []);
    }
    summariesByDate.get(date)!.push(summary);
  });

  // Calculate last 5 days counts
  const last5DaysCounts: DailyCount[] = [];
  const sortedDates = allDates.sort().reverse(); // Most recent first

  for (let i = 0; i < Math.min(5, sortedDates.length); i++) {
    const date = sortedDates[i];
    const daySummaries = summariesByDate.get(date) || [];

    const ordersWorked = daySummaries.reduce((sum, s) => sum + getBillableOrders(s), 0);
    const ordersLoaded = daySummaries.reduce((sum, s) => sum + s.total_orders, 0);

    last5DaysCounts.push({
      date,
      ordersWorked,
      ordersLoaded,
      isWorkingDay: true, // Already filtered to working days
    });
  }

  // Reverse to show oldest to newest
  last5DaysCounts.reverse();

  // Calculate 7-day average
  const last7Dates = sortedDates.slice(0, Math.min(7, sortedDates.length));
  const last7DaysWorked = last7Dates.reduce((sum, date) => {
    const daySummaries = summariesByDate.get(date) || [];
    return sum + daySummaries.reduce((s, summary) => s + getBillableOrders(summary), 0);
  }, 0);
  const last7DayAvg = last7Dates.length > 0 ? Math.round(last7DaysWorked / last7Dates.length) : 0;

  // Count working days and total days
  const workingDaysCount = allDates.length;
  const totalDaysInRange = Math.floor(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  return {
    totalOrdersLoaded,
    totalOrdersAssigned,
    totalOrdersWorked,
    totalOrdersCompleted: totalOrdersWorked,
    authByRisa,
    authOnFile,
    noAuthRequired,
    denialByRisa,
    denialAfterQuery,
    existingDenial,
    query,
    pending,
    hold,
    authRequired,
    other,
    approvalRate,
    authorizationRate,
    last5DaysCounts,
    last7DayAvg,
    workingDaysCount,
    totalDaysCount: totalDaysInRange,
    dateRange: { startDate, endDate },
    organizationIds,
  };
}

/**
 * Generate array of date strings between start and end (inclusive)
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Array of date strings
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}
