/**
 * RPA Metrics Calculation Utilities
 *
 * This file contains utility functions for calculating and aggregating RPA metrics
 * from raw snapshots.
 */

import { format } from 'date-fns';
import type {
  RPAOrderSnapshot,
  RPADailySummary,
  RPAUserBreakdown,
  RPATrendDataPoint,
  RPAHourlyDataPoint,
  RPAAggregatedSummary,
} from '../../types/rpaMetrics';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

function getLatestSnapshotPerOrder(snapshots: RPAOrderSnapshot[]): RPAOrderSnapshot[] {
  const grouped = groupBy(snapshots, (s) => s.order_id);

  return Object.values(grouped).map((orderSnapshots) => {
    return orderSnapshots.sort((a, b) => b.snapshot_timestamp.localeCompare(a.snapshot_timestamp))[0];
  });
}

// ============================================================================
// DAILY SUMMARY CALCULATION
// ============================================================================

/**
 * Calculate RPA daily summary from raw snapshots
 * Groups by facility_id + date_of_work date
 */
export function calculateRPADailySummary(snapshots: RPAOrderSnapshot[]): RPADailySummary[] {
  // Group by facility + date_of_work
  const grouped = groupBy(snapshots, (s) => {
    const datePart = s.date_of_work?.split('T')[0] || ''; // Extract YYYY-MM-DD
    return `${s.org_id}|${datePart}`;
  });

  return Object.entries(grouped).map(([key, allSnapshots]) => {
    const [facility_id, date] = key.split('|');

    // DEDUPLICATION: Get latest snapshot per order
    const latestByOrder = getLatestSnapshotPerOrder(allSnapshots);

    // Filter: Only worked orders
    const workedOrders = latestByOrder.filter((o) => o.is_worked);

    const total_orders_worked = workedOrders.length;

    // Comment RPA counts
    const comment_rpa_not_initiated = workedOrders.filter((o) => o.ev_write_back_status === 'not_initiated').length;
    const comment_rpa_success = workedOrders.filter((o) => o.ev_write_back_status === 'success').length;
    const comment_rpa_error = workedOrders.filter((o) => o.ev_write_back_status === 'error').length;
    const comment_rpa_triggered = comment_rpa_success + comment_rpa_error;

    // Document RPA counts
    const document_rpa_not_initiated = workedOrders.filter((o) => o.document_upload_status === 'not_initiated').length;
    const document_rpa_success = workedOrders.filter((o) => o.document_upload_status === 'success').length;
    const document_rpa_error = workedOrders.filter((o) => o.document_upload_status === 'error').length;
    const document_rpa_triggered = document_rpa_success + document_rpa_error;

    // Health First NAR RPA counts
    const hf_nar_rpa_not_initiated = workedOrders.filter((o) => o.health_first_nar_rpa_status === 'not_initiated').length;
    const hf_nar_rpa_success = workedOrders.filter((o) => o.health_first_nar_rpa_status === 'success').length;
    const hf_nar_rpa_error = workedOrders.filter((o) => o.health_first_nar_rpa_status === 'error').length;
    const hf_nar_rpa_triggered = hf_nar_rpa_success + hf_nar_rpa_error;

    // Document compliance (auth_by_risa orders)
    const auth_by_risa_orders = workedOrders.filter((o) => o.master_auth_status === 'auth_by_risa');
    const auth_by_risa_count = auth_by_risa_orders.length;
    const auth_by_risa_doc_uploaded = auth_by_risa_orders.filter((o) => o.document_upload_status !== 'not_initiated').length;
    const auth_by_risa_doc_missing = auth_by_risa_count - auth_by_risa_doc_uploaded;

    // Calculate percentages
    const pct_comment_rpa_triggered = total_orders_worked > 0 ? (comment_rpa_triggered / total_orders_worked) * 100 : 0;
    const pct_comment_rpa_success = total_orders_worked > 0 ? (comment_rpa_success / total_orders_worked) * 100 : 0;
    const pct_document_rpa_triggered = total_orders_worked > 0 ? (document_rpa_triggered / total_orders_worked) * 100 : 0;
    const pct_document_rpa_success = total_orders_worked > 0 ? (document_rpa_success / total_orders_worked) * 100 : 0;
    const pct_document_compliance = auth_by_risa_count > 0 ? (auth_by_risa_doc_uploaded / auth_by_risa_count) * 100 : 100;
    const pct_overall_rpa_failure =
      total_orders_worked > 0 ? ((comment_rpa_error + document_rpa_error + hf_nar_rpa_error) / total_orders_worked) * 100 : 0;

    return {
      date,
      facility_id,
      total_orders_worked,

      comment_rpa_triggered,
      comment_rpa_success,
      comment_rpa_error,
      comment_rpa_not_initiated,

      document_rpa_triggered,
      document_rpa_success,
      document_rpa_error,
      document_rpa_not_initiated,

      hf_nar_rpa_triggered,
      hf_nar_rpa_success,
      hf_nar_rpa_error,
      hf_nar_rpa_not_initiated,

      auth_by_risa_count,
      auth_by_risa_doc_uploaded,
      auth_by_risa_doc_missing,

      pct_comment_rpa_triggered,
      pct_comment_rpa_success,
      pct_document_rpa_triggered,
      pct_document_rpa_success,
      pct_document_compliance,
      pct_overall_rpa_failure,
    };
  });
}

// ============================================================================
// USER BREAKDOWN CALCULATION
// ============================================================================

/**
 * Calculate RPA user breakdown
 */
export function calculateRPAUserBreakdown(snapshots: RPAOrderSnapshot[], dateRange: string): RPAUserBreakdown[] {
  const grouped = groupBy(snapshots, (s) => `${s.org_id}|${s.username}`);

  return Object.entries(grouped).map(([key, allSnapshots]) => {
    const [facility_id, username] = key.split('|');

    const latestByOrder = getLatestSnapshotPerOrder(allSnapshots);
    const workedOrders = latestByOrder.filter((o) => o.is_worked);

    const total_orders = workedOrders.length;

    const comment_rpa_manual = workedOrders.filter((o) => o.ev_write_back_status === 'not_initiated').length;
    const comment_rpa_automated = total_orders - comment_rpa_manual;

    const document_rpa_manual = workedOrders.filter((o) => o.document_upload_status === 'not_initiated').length;
    const document_rpa_automated = total_orders - document_rpa_manual;

    const pct_comment_automation = total_orders > 0 ? (comment_rpa_automated / total_orders) * 100 : 0;
    const pct_document_automation = total_orders > 0 ? (document_rpa_automated / total_orders) * 100 : 0;

    return {
      date_range: dateRange,
      facility_id,
      username,
      total_orders,
      comment_rpa_manual,
      comment_rpa_automated,
      document_rpa_manual,
      document_rpa_automated,
      pct_comment_automation,
      pct_document_automation,
    };
  });
}

// ============================================================================
// TREND DATA PREPARATION
// ============================================================================

/**
 * Prepare RPA trend data for charts
 */
export function prepareRPATrendData(summaries: RPADailySummary[]): RPATrendDataPoint[] {
  // Group by date, aggregate across facilities
  const grouped = groupBy(summaries, (s) => s.date);

  const trendPoints = Object.entries(grouped).map(([date, daySummaries]) => {
    const totals = aggregateRPASummaries(daySummaries);

    const total_rpa_operations = totals.comment_rpa_success + totals.comment_rpa_error + totals.document_rpa_success + totals.document_rpa_error;

    return {
      date,
      displayLabel: format(new Date(date), 'MMM d'),
      comment_rpa_success_rate: totals.comment_rpa_automation_rate, // Approximation
      document_rpa_success_rate: totals.document_rpa_automation_rate, // Approximation
      rpa_failure_rate:
        totals.total_orders_worked > 0 ? ((totals.comment_rpa_error + totals.document_rpa_error) / totals.total_orders_worked) * 100 : 0,
      document_compliance_rate: totals.document_compliance_rate,
    };
  });

  // Sort by date
  return trendPoints.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// HOURLY METRICS CALCULATION
// ============================================================================

/**
 * Calculate hourly RPA metrics
 */
export function calculateRPAHourlyMetrics(snapshots: RPAOrderSnapshot[]): RPAHourlyDataPoint[] {
  const extractHour = (timestamp: string): string => {
    // Extract hour from "2026-01-13 14:23:45" -> "14"
    const parts = timestamp.split(' ');
    if (parts.length < 2) return '00';
    return parts[1].split(':')[0];
  };

  const formatHour = (hour: string): string => {
    const h = parseInt(hour, 10);
    if (isNaN(h)) return hour;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:00 ${period}`;
  };

  const grouped = groupBy(snapshots, (s) => extractHour(s.snapshot_timestamp));

  return Object.entries(grouped)
    .map(([hour_ist, hourSnapshots]) => {
      const latestByOrder = getLatestSnapshotPerOrder(hourSnapshots);
      const workedOrders = latestByOrder.filter((o) => o.is_worked);

      const comment_rpa_failures = workedOrders.filter((o) => o.ev_write_back_status === 'error').length;
      const document_rpa_failures = workedOrders.filter((o) => o.document_upload_status === 'error').length;
      const hf_nar_rpa_failures = workedOrders.filter((o) => o.health_first_nar_rpa_status === 'error').length;

      return {
        hour: formatHour(hour_ist),
        hour_ist,
        comment_rpa_failures,
        document_rpa_failures,
        hf_nar_rpa_failures,
        total_failures: comment_rpa_failures + document_rpa_failures + hf_nar_rpa_failures,
      };
    })
    .sort((a, b) => parseInt(a.hour_ist) - parseInt(b.hour_ist));
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Aggregate RPA summaries across facilities/dates
 */
export function aggregateRPASummaries(summaries: RPADailySummary[]): RPAAggregatedSummary {
  const total_orders_worked = summaries.reduce((sum, s) => sum + s.total_orders_worked, 0);
  const comment_rpa_success = summaries.reduce((sum, s) => sum + s.comment_rpa_success, 0);
  const comment_rpa_error = summaries.reduce((sum, s) => sum + s.comment_rpa_error, 0);
  const document_rpa_success = summaries.reduce((sum, s) => sum + s.document_rpa_success, 0);
  const document_rpa_error = summaries.reduce((sum, s) => sum + s.document_rpa_error, 0);
  const comment_rpa_triggered = summaries.reduce((sum, s) => sum + s.comment_rpa_triggered, 0);
  const document_rpa_triggered = summaries.reduce((sum, s) => sum + s.document_rpa_triggered, 0);
  const auth_by_risa_count = summaries.reduce((sum, s) => sum + s.auth_by_risa_count, 0);
  const auth_by_risa_doc_uploaded = summaries.reduce((sum, s) => sum + s.auth_by_risa_doc_uploaded, 0);

  const comment_rpa_automation_rate = total_orders_worked > 0 ? (comment_rpa_triggered / total_orders_worked) * 100 : 0;
  const document_rpa_automation_rate = total_orders_worked > 0 ? (document_rpa_triggered / total_orders_worked) * 100 : 0;

  const total_rpa_successes = comment_rpa_success + document_rpa_success;
  const total_rpa_triggered = comment_rpa_triggered + document_rpa_triggered;
  const overall_rpa_success_rate = total_rpa_triggered > 0 ? (total_rpa_successes / total_rpa_triggered) * 100 : 0;

  const document_compliance_rate = auth_by_risa_count > 0 ? (auth_by_risa_doc_uploaded / auth_by_risa_count) * 100 : 100;

  return {
    total_orders_worked,
    comment_rpa_automation_rate,
    document_rpa_automation_rate,
    overall_rpa_success_rate,
    document_compliance_rate,
    comment_rpa_success,
    comment_rpa_error,
    document_rpa_success,
    document_rpa_error,
  };
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format percentage with 1 decimal place
 */
export function formatPercentage(value: number | null): string {
  if (value === null || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

/**
 * Format number with comma separators
 */
export function formatNumber(value: number | null): string {
  if (value === null || isNaN(value)) return 'N/A';
  return value.toLocaleString();
}

/**
 * Get color for metric based on threshold
 */
export function getMetricColor(value: number, threshold: { good: number; warning: number; critical: number }): 'green' | 'yellow' | 'red' {
  if (value >= threshold.good) return 'green';
  if (value >= threshold.warning) return 'yellow';
  return 'red';
}
