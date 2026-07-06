/**
 * Monitoring Metrics Calculation Utilities
 * Functions for calculating data for the 4 comprehensive monitoring tables
 */

import type { DailySummary } from '../types/orders';
import type {
  OrdersFunnelSummary,
  OrdersFunnelDay,
  AuthStatusBreakdownSummary,
  AuthStatusBreakdownDay,
  DenialTrackingSummary,
  DenialTrackingDay,
  OrderAccuracyMetrics,
  OrderAccuracyDay,
  OrderAccuracyWeek,
  MonitoringTablesData,
} from '../types/business';
import { calculateApprovalRate, calculateAuthorizationRate } from './businessMetrics';

// ====================================================================
// Helper Functions
// ====================================================================

/**
 * Group daily summaries by date
 */
function groupByDate(summaries: DailySummary[]): Map<string, DailySummary[]> {
  const map = new Map<string, DailySummary[]>();
  summaries.forEach((summary) => {
    const date = summary.created_at_date;
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date)!.push(summary);
  });
  return map;
}

/**
 * Sum a field across an array of summaries
 */
function sum(summaries: DailySummary[], field: (s: DailySummary) => number): number {
  return summaries.reduce((total, s) => total + field(s), 0);
}

/**
 * Calculate percentage (handles division by zero)
 */
function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return parseFloat(((numerator / denominator) * 100).toFixed(1));
}

/**
 * Calculate rolling average for Orders Funnel metrics
 */
function calculateFunnelRollingAverage(
  dailyData: OrdersFunnelDay[],
  window: number
): OrdersFunnelDay {
  const count = Math.min(window, dailyData.length);

  if (count === 0) {
    return {
      date: `L${window}D Avg`,
      ordersLoaded: 0,
      ordersAssigned: 0,
      ordersCompleted: 0,
      pctAssignedOfLoaded: null,
      pctCompletedOfAssigned: null,
      pctCompletedOfLoaded: null,
      pctInProgressOfLoaded: null,
    };
  }

  // Take the most recent 'window' days
  const recentData = dailyData.slice(-count);

  const totalLoaded = recentData.reduce((sum, d) => sum + d.ordersLoaded, 0);
  const totalAssigned = recentData.reduce((sum, d) => sum + d.ordersAssigned, 0);
  const totalCompleted = recentData.reduce((sum, d) => sum + d.ordersCompleted, 0);

  const avgLoaded = Math.round(totalLoaded / count);
  const avgAssigned = Math.round(totalAssigned / count);
  const avgCompleted = Math.round(totalCompleted / count);
  const avgInProgress = avgAssigned - avgCompleted;

  return {
    date: `L${window}D Avg`,
    ordersLoaded: avgLoaded,
    ordersAssigned: avgAssigned,
    ordersCompleted: avgCompleted,
    pctAssignedOfLoaded: percentage(avgAssigned, avgLoaded),
    pctCompletedOfAssigned: percentage(avgCompleted, avgAssigned),
    pctCompletedOfLoaded: percentage(avgCompleted, avgLoaded),
    pctInProgressOfLoaded: percentage(avgInProgress, avgLoaded),
  };
}

/**
 * Calculate rolling average for Auth Status Breakdown percentages
 */
function calculateAuthStatusRollingAverage(
  dailyData: AuthStatusBreakdownDay[],
  window: number
): AuthStatusBreakdownDay {
  const count = Math.min(window, dailyData.length);

  if (count === 0) {
    return {
      date: `L${window}D Avg`,
      authByRisaPct: null,
      noAuthRequiredPct: null,
      authOnFilePct: null,
      denialByRisaPct: null,
      deniedAfterQueryPct: null,
      existingDenialPct: null,
      inProgressPct: null,
      restPct: null,
      total: 0,
      totalPct: 100,
    };
  }

  const recentData = dailyData.slice(-count);

  // Calculate average percentages
  const avgAuthByRisa = recentData.reduce((sum, d) => sum + (d.authByRisaPct || 0), 0) / count;
  const avgNoAuthRequired = recentData.reduce((sum, d) => sum + (d.noAuthRequiredPct || 0), 0) / count;
  const avgAuthOnFile = recentData.reduce((sum, d) => sum + (d.authOnFilePct || 0), 0) / count;
  const avgDenialByRisa = recentData.reduce((sum, d) => sum + (d.denialByRisaPct || 0), 0) / count;
  const avgDeniedAfterQuery = recentData.reduce((sum, d) => sum + (d.deniedAfterQueryPct || 0), 0) / count;
  const avgExistingDenial = recentData.reduce((sum, d) => sum + (d.existingDenialPct || 0), 0) / count;
  const avgInProgress = recentData.reduce((sum, d) => sum + (d.inProgressPct || 0), 0) / count;
  const avgRest = recentData.reduce((sum, d) => sum + (d.restPct || 0), 0) / count;
  const avgTotal = recentData.reduce((sum, d) => sum + d.total, 0) / count;

  return {
    date: `L${window}D Avg`,
    authByRisaPct: parseFloat(avgAuthByRisa.toFixed(1)),
    noAuthRequiredPct: parseFloat(avgNoAuthRequired.toFixed(1)),
    authOnFilePct: parseFloat(avgAuthOnFile.toFixed(1)),
    denialByRisaPct: parseFloat(avgDenialByRisa.toFixed(1)),
    deniedAfterQueryPct: parseFloat(avgDeniedAfterQuery.toFixed(1)),
    existingDenialPct: parseFloat(avgExistingDenial.toFixed(1)),
    inProgressPct: parseFloat(avgInProgress.toFixed(1)),
    restPct: parseFloat(avgRest.toFixed(1)),
    total: Math.round(avgTotal),
    totalPct: 100,
  };
}

// ====================================================================
// Orders Funnel Calculations
// ====================================================================

/**
 * Calculate Orders Funnel data with L7D and L30D averages
 */
export function calculateOrdersFunnel(
  summaries: DailySummary[],
  uniqueDates: string[]
): OrdersFunnelSummary {
  const summariesByDate = groupByDate(summaries);

  // Calculate daily breakdown
  const dailyBreakdown: OrdersFunnelDay[] = uniqueDates.map(date => {
    const daySummaries = summariesByDate.get(date) || [];

    const ordersLoaded = sum(daySummaries, s => s.total_orders);
    const ordersAssigned = sum(daySummaries, s => s.orders_assigned);
    const ordersCompleted = sum(daySummaries, s => s.orders_completed);
    const ordersInProgress = ordersAssigned - ordersCompleted;

    return {
      date,
      ordersLoaded,
      ordersAssigned,
      ordersCompleted,
      pctAssignedOfLoaded: percentage(ordersAssigned, ordersLoaded),
      pctCompletedOfAssigned: percentage(ordersCompleted, ordersAssigned),
      pctCompletedOfLoaded: percentage(ordersCompleted, ordersLoaded),
      pctInProgressOfLoaded: percentage(ordersInProgress, ordersLoaded),
    };
  });

  // Calculate L7D and L30D averages
  const l7dAvg = calculateFunnelRollingAverage(dailyBreakdown, 7);
  const l30dAvg = calculateFunnelRollingAverage(dailyBreakdown, 30);

  return { dailyBreakdown, l7dAvg, l30dAvg };
}

// ====================================================================
// Auth Status Breakdown Calculations
// ====================================================================

/**
 * Calculate Auth Status Breakdown percentages with L7D and L30D averages
 */
export function calculateAuthStatusBreakdown(
  summaries: DailySummary[],
  uniqueDates: string[]
): AuthStatusBreakdownSummary {
  const summariesByDate = groupByDate(summaries);

  const dailyBreakdown: AuthStatusBreakdownDay[] = uniqueDates.map(date => {
    const daySummaries = summariesByDate.get(date) || [];

    // Sum all status counts
    const authByRisa = sum(daySummaries, s => s.status_auth_by_risa);
    const noAuthRequired = sum(daySummaries, s => s.status_no_auth_required);
    const authOnFile = sum(daySummaries, s => s.status_auth_on_file);
    const denialByRisa = sum(daySummaries, s => s.status_denial_by_risa);
    const deniedAfterQuery = sum(daySummaries, s => s.status_denial_after_query);
    const existingDenial = sum(daySummaries, s => s.status_existing_denial);
    const inProgress = sum(daySummaries, s =>
      s.status_pending + s.status_hold + s.status_query + s.status_auth_required
    );
    const rest = sum(daySummaries, s => s.status_other);
    const total = sum(daySummaries, s => s.orders_completed);

    // Calculate percentages (completed orders only)
    const authByRisaPct = percentage(authByRisa, total);
    const noAuthRequiredPct = percentage(noAuthRequired, total);
    const authOnFilePct = percentage(authOnFile, total);
    const denialByRisaPct = percentage(denialByRisa, total);
    const deniedAfterQueryPct = percentage(deniedAfterQuery, total);
    const existingDenialPct = percentage(existingDenial, total);
    const inProgressPct = percentage(inProgress, total);
    const restPct = percentage(rest, total);

    // Sum all percentages (should be close to 100%)
    const totalPct = [
      authByRisaPct,
      noAuthRequiredPct,
      authOnFilePct,
      denialByRisaPct,
      deniedAfterQueryPct,
      existingDenialPct,
      inProgressPct,
      restPct,
    ].reduce((sum: number, pct) => sum + (pct || 0), 0);

    return {
      date,
      authByRisaPct,
      noAuthRequiredPct,
      authOnFilePct,
      denialByRisaPct,
      deniedAfterQueryPct,
      existingDenialPct,
      inProgressPct,
      restPct,
      total,
      totalPct: parseFloat(totalPct.toFixed(1)),
    };
  });

  const l7dAvg = calculateAuthStatusRollingAverage(dailyBreakdown, 7);
  const l30dAvg = calculateAuthStatusRollingAverage(dailyBreakdown, 30);

  return { dailyBreakdown, l7dAvg, l30dAvg };
}

// ====================================================================
// Denial Tracking Calculations
// ====================================================================

/**
 * Calculate Denial Tracking data
 */
export function calculateDenialTracking(
  summaries: DailySummary[],
  uniqueDates: string[]
): DenialTrackingSummary {
  const summariesByDate = groupByDate(summaries);

  const dailyBreakdown: DenialTrackingDay[] = uniqueDates.map(date => {
    const daySummaries = summariesByDate.get(date) || [];

    const denialByRisa = sum(daySummaries, s => s.status_denial_by_risa);
    const deniedAfterQuery = sum(daySummaries, s => s.status_denial_after_query);
    const existingDenial = sum(daySummaries, s => s.status_existing_denial);
    const totalDenials = denialByRisa + deniedAfterQuery + existingDenial;

    return {
      date,
      totalDenials,
      denialByRisa,
      deniedAfterQuery,
      existingDenial,
    };
  });

  return { dailyBreakdown };
}

// ====================================================================
// Order Accuracy Calculations
// ====================================================================

/**
 * Calculate weekly aggregation for Order Accuracy metrics
 */
function calculateWeeklyAggregation(dailyView: OrderAccuracyDay[]): OrderAccuracyWeek[] {
  if (dailyView.length === 0) return [];

  // Group by week (7-day chunks starting from first date)
  const weeks: OrderAccuracyWeek[] = [];

  for (let i = 0; i < dailyView.length; i += 7) {
    const weekData = dailyView.slice(i, Math.min(i + 7, dailyView.length));

    if (weekData.length === 0) continue;

    const weekNumber = Math.floor(i / 7) + 1;
    const weekStartDate = weekData[0].date;
    const weekEndDate = weekData[weekData.length - 1].date;

    // Calculate average rates for the week (only include non-null values)
    const authRates = weekData.map(d => d.authorizationRate).filter(r => r !== null) as number[];
    const approvalRates = weekData.map(d => d.approvalRate).filter(r => r !== null) as number[];

    const avgAuthRate = authRates.length > 0
      ? parseFloat((authRates.reduce((sum, r) => sum + r, 0) / authRates.length).toFixed(1))
      : null;

    const avgApprovalRate = approvalRates.length > 0
      ? parseFloat((approvalRates.reduce((sum, r) => sum + r, 0) / approvalRates.length).toFixed(1))
      : null;

    weeks.push({
      weekLabel: `W${weekNumber}`,
      weekStartDate,
      weekEndDate,
      authorizationRate: avgAuthRate,
      approvalRate: avgApprovalRate,
    });
  }

  return weeks;
}

/**
 * Calculate Order Accuracy Metrics (daily and weekly)
 */
export function calculateOrderAccuracy(
  summaries: DailySummary[],
  uniqueDates: string[]
): OrderAccuracyMetrics {
  const summariesByDate = groupByDate(summaries);

  // Daily view
  const dailyView: OrderAccuracyDay[] = uniqueDates.map(date => {
    const daySummaries = summariesByDate.get(date) || [];

    const authByRisa = sum(daySummaries, s => s.status_auth_by_risa);
    const authOnFile = sum(daySummaries, s => s.status_auth_on_file);
    const noAuthRequired = sum(daySummaries, s => s.status_no_auth_required);
    const denialByRisa = sum(daySummaries, s => s.status_denial_by_risa);
    const denialAfterQuery = sum(daySummaries, s => s.status_denial_after_query);

    return {
      date,
      authorizationRate: calculateAuthorizationRate(
        authByRisa,
        authOnFile,
        noAuthRequired,
        denialByRisa,
        denialAfterQuery
      ),
      approvalRate: calculateApprovalRate(authByRisa, denialByRisa),
    };
  });

  // Weekly view - group by weeks
  const weeklyView = calculateWeeklyAggregation(dailyView);

  return { dailyView, weeklyView };
}

// ====================================================================
// Main Entry Point
// ====================================================================

/**
 * Calculate all monitoring tables data
 * @param summaries - Filtered daily summaries (already filtered by date range, facilities, weekends)
 * @param uniqueDates - Sorted array of unique dates in the filtered range
 * @returns Complete monitoring tables dataset
 */
export function calculateMonitoringTables(
  summaries: DailySummary[],
  uniqueDates: string[]
): MonitoringTablesData {
  return {
    ordersFunnel: calculateOrdersFunnel(summaries, uniqueDates),
    authStatusBreakdown: calculateAuthStatusBreakdown(summaries, uniqueDates),
    denialTracking: calculateDenialTracking(summaries, uniqueDates),
    orderAccuracy: calculateOrderAccuracy(summaries, uniqueDates),
  };
}
