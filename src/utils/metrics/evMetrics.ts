import { format } from 'date-fns';
import type {
  EVOrderSnapshot,
  EVDailySummary,
  EVHourlyMetrics,
  EVPayerBreakdown,
  EVTrendDataPoint,
  EVHourlyTrendDataPoint,
  EVErrorBreakdown,
  EVAggregatedSummary,
  EVErrorType,
} from '../../types/evMetrics';
import type { UniqueOrderStatus } from '../../types/orders';
import { toISTTimestamp } from '../timezone';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Group array by key function
 */
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

/**
 * Get latest snapshot per order (for deduplication)
 * Within a group of snapshots for the same order, return the one with latest timestamp
 */
function getLatestSnapshotPerOrder(snapshots: EVOrderSnapshot[]): EVOrderSnapshot[] {
  const grouped = groupBy(snapshots, (s) => s.order_id);

  return Object.values(grouped).map((orderSnapshots) => {
    // Sort by timestamp descending, take first (latest)
    return orderSnapshots.sort((a, b) => b.snapshot_timestamp.localeCompare(a.snapshot_timestamp))[0];
  });
}

/**
 * Classify error type from ev_bv_primary status string
 */
export function classifyErrorType(evStatus: string | null): EVErrorType | null {
  if (!evStatus) return null;

  const lower = evStatus.toLowerCase();

  // Not an error
  if (lower === 'completed' || lower === 'in_progress' || lower === '_retrying') {
    return null;
  }

  // Error classification (order matters - more specific first)
  if (lower.includes('timeout')) return 'timeout';
  if (lower.match(/auth|authentication|authorization/)) return 'auth';
  if (lower.includes('ev_type_not_supported') || lower.includes('type_not_supported')) return 'type_not_supported';
  if (lower.includes('maxed_out') || lower.includes('rate_limit')) return 'rate_limit';
  if (lower.includes('validation') || lower.includes('field_validation')) return 'validation';
  if (lower.includes('network') || lower.includes('communication') || lower.includes('request_error')) return 'network';

  // Default to 'other' for unrecognized errors (generic "error", "pinf", etc.)
  return 'other';
}

/**
 * Normalize primary_active status from Algolia/unique_orders_status
 * Centralizes the normalization logic used across EV metrics pipeline
 */
export function normalizeActiveStatus(status: string | null | undefined): 'active' | 'inactive' | 'unknown' | null {
  if (!status) return null;

  const lower = String(status).toLowerCase().trim();

  if (lower === 'active' || lower === 'active coverage') return 'active';
  if (lower === 'inactive' || lower === 'inactive coverage') return 'inactive';
  if (lower === 'coverage unknown' || lower === 'unknown' || lower === '-') return 'unknown';

  // Default to unknown for unrecognized values
  return 'unknown';
}

/**
 * Calculate EV payer breakdown from UniqueOrderStatus[] (on-demand from unique_orders_status)
 * Used by the payer-breakdown API endpoint instead of reading from ev_raw_snapshots
 */
export function calculateEVPayerBreakdownFromOrders(orders: UniqueOrderStatus[]): EVPayerBreakdown[] {
  // Group by facility_id + date + payer_name
  const grouped = groupBy(orders, (o) => {
    const datePart = o.created_at_iso ? o.created_at_iso.split('T')[0].split(' ')[0] : '';
    const payer = o.primary_payer_name || 'Unknown';
    return `${o.org_id}|${datePart}|${payer}`;
  });

  return Object.entries(grouped).map(([key, groupOrders]) => {
    const [facility_id, created_at_date, payer_name] = key.split('|');

    const total_orders = groupOrders.length;
    const orders_active = groupOrders.filter((o) => normalizeActiveStatus(o.primary_active) === 'active').length;
    const orders_inactive = groupOrders.filter((o) => normalizeActiveStatus(o.primary_active) === 'inactive').length;
    const orders_unknown = groupOrders.filter(
      (o) => !o.primary_active || normalizeActiveStatus(o.primary_active) === 'unknown'
    ).length;

    const ev_completed = groupOrders.filter((o) => o.ev_bv_primary === 'completed').length;
    const ev_in_progress = groupOrders.filter((o) => o.ev_bv_primary === 'in_progress').length;
    const ev_error_total = groupOrders.filter((o) => classifyErrorType(o.ev_bv_primary) !== null).length;

    const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
    const pct_inactive = total_orders > 0 ? (orders_inactive / total_orders) * 100 : 0;
    const pct_unknown = total_orders > 0 ? (orders_unknown / total_orders) * 100 : 0;
    const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
    const pct_in_progress = total_orders > 0 ? (ev_in_progress / total_orders) * 100 : 0;
    const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

    return {
      created_at_date,
      facility_id,
      payer_name,
      total_orders,
      orders_active,
      orders_inactive,
      orders_unknown,
      ev_completed,
      ev_in_progress,
      ev_error_total,
      pct_active: Math.round(pct_active * 10) / 10,
      pct_inactive: Math.round(pct_inactive * 10) / 10,
      pct_unknown: Math.round(pct_unknown * 10) / 10,
      pct_completed: Math.round(pct_completed * 10) / 10,
      pct_in_progress: Math.round(pct_in_progress * 10) / 10,
      pct_error: Math.round(pct_error * 10) / 10,
    };
  });
}

/**
 * Format hour string to display label
 */
function formatHourLabel(hourIst: string): string {
  const hour = parseInt(hourIst, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) return hourIst;

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return `${displayHour}:00 ${period}`;
}

// ============================================================================
// DAILY SUMMARY CALCULATION
// ============================================================================

/**
 * Calculate EV daily summary from raw snapshots
 * Deduplicates by order_id (takes latest snapshot per order)
 * Groups by facility_id + created_at_date
 */
export function calculateEVDailySummary(snapshots: EVOrderSnapshot[]): EVDailySummary[] {
  // Group by facility + date (extract date part from timestamp)
  const grouped = groupBy(snapshots, (s) => {
    const datePart = s.created_at_date.split(' ')[0]; // Extract YYYY-MM-DD
    return `${s.facility_id}|${datePart}`;
  });

  return Object.entries(grouped).map(([key, allSnapshots]) => {
    const [facility_id, created_at_date] = key.split('|');

    // DEDUPLICATION: Get latest snapshot per order
    const latestByOrder = getLatestSnapshotPerOrder(allSnapshots);

    // Calculate counts
    const total_orders = latestByOrder.length;
    const orders_active = latestByOrder.filter((o) => o.primary_active === 'active').length;
    const orders_inactive = latestByOrder.filter((o) => o.primary_active === 'inactive').length;
    const orders_unknown = latestByOrder.filter(
      (o) => !o.primary_active || o.primary_active === 'unknown'
    ).length;

    const ev_completed = latestByOrder.filter((o) => o.ev_bv_primary === 'completed').length;
    const ev_in_progress = latestByOrder.filter((o) => o.ev_bv_primary === 'in_progress').length;

    // Error classification
    const errors = latestByOrder.filter((o) => classifyErrorType(o.ev_bv_primary) !== null);
    const ev_error_total = errors.length;

    const ev_error_timeout = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'timeout').length;
    const ev_error_auth = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'auth').length;
    const ev_error_network = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'network').length;
    const ev_error_validation = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'validation').length;
    const ev_error_type_not_supported = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'type_not_supported').length;
    const ev_error_rate_limit = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'rate_limit').length;
    const ev_error_other = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'other').length;

    // Calculate percentages
    const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
    const pct_inactive = total_orders > 0 ? (orders_inactive / total_orders) * 100 : 0;
    const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
    const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

    return {
      created_at_date,
      facility_id,
      total_orders,
      orders_active,
      orders_inactive,
      orders_unknown,
      ev_completed,
      ev_in_progress,
      ev_error_total,
      ev_error_timeout,
      ev_error_auth,
      ev_error_network,
      ev_error_validation,
      ev_error_type_not_supported,
      ev_error_rate_limit,
      ev_error_other,
      pct_active: Math.round(pct_active * 10) / 10, // Round to 1 decimal
      pct_inactive: Math.round(pct_inactive * 10) / 10,
      pct_completed: Math.round(pct_completed * 10) / 10,
      pct_error: Math.round(pct_error * 10) / 10,
      last_updated_timestamp: toISTTimestamp(new Date()),
    };
  });
}

// ============================================================================
// HOURLY METRICS CALCULATION
// ============================================================================

/**
 * Calculate EV hourly metrics for intraday trend
 * Groups by facility_id + created_at_date + snapshot_hour_ist
 * Deduplicates within each hour
 */
export function calculateEVHourlyMetrics(snapshots: EVOrderSnapshot[]): EVHourlyMetrics[] {
  // Group by facility + date + hour
  const grouped = groupBy(snapshots, (s) => `${s.facility_id}|${s.created_at_date}|${s.snapshot_hour_ist}`);

  return Object.entries(grouped).map(([key, hourSnapshots]) => {
    const [facility_id, created_at_date, snapshot_hour_ist] = key.split('|');

    // Deduplicate within this hour
    const latestInHour = getLatestSnapshotPerOrder(hourSnapshots);

    const total_orders = latestInHour.length;
    const orders_active = latestInHour.filter((o) => o.primary_active === 'active').length;
    const orders_inactive = latestInHour.filter((o) => o.primary_active === 'inactive').length;
    const orders_unknown = latestInHour.filter(
      (o) => !o.primary_active || o.primary_active === 'unknown'
    ).length;

    const ev_completed = latestInHour.filter((o) => o.ev_bv_primary === 'completed').length;
    const ev_in_progress = latestInHour.filter((o) => o.ev_bv_primary === 'in_progress').length;
    const ev_error_total = latestInHour.filter((o) => classifyErrorType(o.ev_bv_primary) !== null).length;

    const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
    const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
    const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

    return {
      created_at_date,
      facility_id,
      snapshot_hour_ist,
      snapshot_hour_label: formatHourLabel(snapshot_hour_ist),
      total_orders,
      orders_active,
      orders_inactive,
      orders_unknown,
      ev_completed,
      ev_in_progress,
      ev_error_total,
      pct_active: Math.round(pct_active * 10) / 10,
      pct_completed: Math.round(pct_completed * 10) / 10,
      pct_error: Math.round(pct_error * 10) / 10,
    };
  });
}

// ============================================================================
// PAYER BREAKDOWN CALCULATION
// ============================================================================

/**
 * Calculate EV payer breakdown
 * Groups by facility_id + created_at_date + payer_name
 * Deduplicates by order_id
 */
export function calculateEVPayerBreakdown(snapshots: EVOrderSnapshot[]): EVPayerBreakdown[] {
  // Group by facility + date + payer (extract date part from timestamp)
  const grouped = groupBy(
    snapshots,
    (s) => {
      const datePart = s.created_at_date.split(' ')[0]; // Extract YYYY-MM-DD
      return `${s.facility_id}|${datePart}|${s.primary_payer_name || 'Unknown'}`;
    }
  );

  return Object.entries(grouped).map(([key, allSnapshots]) => {
    const [facility_id, created_at_date, payer_name] = key.split('|');

    // Deduplicate
    const latestByOrder = getLatestSnapshotPerOrder(allSnapshots);

    const total_orders = latestByOrder.length;
    const orders_active = latestByOrder.filter((o) => o.primary_active === 'active').length;
    const orders_inactive = latestByOrder.filter((o) => o.primary_active === 'inactive').length;
    const orders_unknown = latestByOrder.filter(
      (o) => !o.primary_active || o.primary_active === 'unknown'
    ).length;

    const ev_completed = latestByOrder.filter((o) => o.ev_bv_primary === 'completed').length;
    const ev_in_progress = latestByOrder.filter((o) => o.ev_bv_primary === 'in_progress').length;
    const ev_error_total = latestByOrder.filter((o) => classifyErrorType(o.ev_bv_primary) !== null).length;

    const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
    const pct_inactive = total_orders > 0 ? (orders_inactive / total_orders) * 100 : 0;
    const pct_unknown = total_orders > 0 ? (orders_unknown / total_orders) * 100 : 0;
    const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
    const pct_in_progress = total_orders > 0 ? (ev_in_progress / total_orders) * 100 : 0;
    const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

    return {
      created_at_date,
      facility_id,
      payer_name,
      total_orders,
      orders_active,
      orders_inactive,
      orders_unknown,
      ev_completed,
      ev_in_progress,
      ev_error_total,
      pct_active: Math.round(pct_active * 10) / 10,
      pct_inactive: Math.round(pct_inactive * 10) / 10,
      pct_unknown: Math.round(pct_unknown * 10) / 10,
      pct_completed: Math.round(pct_completed * 10) / 10,
      pct_in_progress: Math.round(pct_in_progress * 10) / 10,
      pct_error: Math.round(pct_error * 10) / 10,
    };
  });
}

// ============================================================================
// AGGREGATION & TREND DATA
// ============================================================================

/**
 * Aggregate multiple daily summaries into a single summary
 * Used for overview cards (top A0 metrics)
 */
export function aggregateEVSummaries(summaries: EVDailySummary[]): EVAggregatedSummary {
  const total_orders = summaries.reduce((sum, s) => sum + s.total_orders, 0);
  const orders_active = summaries.reduce((sum, s) => sum + s.orders_active, 0);
  const orders_inactive = summaries.reduce((sum, s) => sum + s.orders_inactive, 0);

  const ev_completed = summaries.reduce((sum, s) => sum + s.ev_completed, 0);
  const ev_in_progress = summaries.reduce((sum, s) => sum + s.ev_in_progress, 0);
  const ev_error_total = summaries.reduce((sum, s) => sum + s.ev_error_total, 0);

  // Error breakdown
  const ev_error_timeout = summaries.reduce((sum, s) => sum + s.ev_error_timeout, 0);
  const ev_error_auth = summaries.reduce((sum, s) => sum + s.ev_error_auth, 0);
  const ev_error_network = summaries.reduce((sum, s) => sum + s.ev_error_network, 0);
  const ev_error_validation = summaries.reduce((sum, s) => sum + s.ev_error_validation, 0);
  const ev_error_type_not_supported = summaries.reduce((sum, s) => sum + s.ev_error_type_not_supported, 0);
  const ev_error_rate_limit = summaries.reduce((sum, s) => sum + s.ev_error_rate_limit, 0);
  const ev_error_other = summaries.reduce((sum, s) => sum + s.ev_error_other, 0);

  const error_breakdown: EVErrorBreakdown[] = [
    {
      error_type: 'Type Not Supported',
      count: ev_error_type_not_supported,
      percentage: ev_error_total > 0 ? (ev_error_type_not_supported / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Network',
      count: ev_error_network,
      percentage: ev_error_total > 0 ? (ev_error_network / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Validation',
      count: ev_error_validation,
      percentage: ev_error_total > 0 ? (ev_error_validation / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Timeout',
      count: ev_error_timeout,
      percentage: ev_error_total > 0 ? (ev_error_timeout / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Authentication',
      count: ev_error_auth,
      percentage: ev_error_total > 0 ? (ev_error_auth / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Rate Limit',
      count: ev_error_rate_limit,
      percentage: ev_error_total > 0 ? (ev_error_rate_limit / ev_error_total) * 100 : 0,
    },
    {
      error_type: 'Other',
      count: ev_error_other,
      percentage: ev_error_total > 0 ? (ev_error_other / ev_error_total) * 100 : 0,
    },
  ].filter((e) => e.count > 0); // Only include error types with non-zero count

  // Calculate A0 metrics
  const ev_success_rate = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
  const active_coverage_rate = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
  const error_rate = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

  return {
    total_orders,
    orders_active,
    orders_inactive,
    ev_completed,
    ev_in_progress,
    ev_error_total,
    ev_success_rate: Math.round(ev_success_rate * 10) / 10,
    active_coverage_rate: Math.round(active_coverage_rate * 10) / 10,
    error_rate: Math.round(error_rate * 10) / 10,
    error_breakdown,
  };
}

/**
 * Prepare daily trend data from summaries for chart display
 */
export function prepareEVTrendData(summaries: EVDailySummary[]): EVTrendDataPoint[] {
  // Sort by date ascending
  const sorted = [...summaries].sort((a, b) => a.created_at_date.localeCompare(b.created_at_date));

  return sorted.map((summary) => ({
    date: summary.created_at_date,
    displayLabel: format(new Date(summary.created_at_date), 'MMM d'), // "Jan 13"
    pct_active: summary.pct_active,
    pct_inactive: summary.pct_inactive,
    pct_completed: summary.pct_completed,
    pct_error: summary.pct_error,
  }));
}

/**
 * Prepare hourly trend data from hourly metrics for intraday chart
 */
export function prepareEVHourlyTrendData(hourlyMetrics: EVHourlyMetrics[]): EVHourlyTrendDataPoint[] {
  // Sort by hour ascending
  const sorted = [...hourlyMetrics].sort(
    (a, b) => parseInt(a.snapshot_hour_ist, 10) - parseInt(b.snapshot_hour_ist, 10)
  );

  return sorted.map((metric) => {
    const pct_in_progress = metric.total_orders > 0 ? (metric.ev_in_progress / metric.total_orders) * 100 : 0;

    return {
      hour: metric.snapshot_hour_label,
      hour_ist: metric.snapshot_hour_ist,
      pct_active: metric.pct_active,
      pct_completed: metric.pct_completed,
      pct_in_progress: Math.round(pct_in_progress * 10) / 10,
      pct_error: metric.pct_error,
    };
  });
}

/**
 * Aggregate payer breakdown data across multiple dates
 * Groups by facility_id + payer_name only (removes date dimension)
 * Used to show combined payer metrics across a date range
 */
export function aggregatePayerBreakdownsByPayer(breakdowns: EVPayerBreakdown[]): EVPayerBreakdown[] {
  // Group by facility_id + payer_name
  const grouped = groupBy(breakdowns, (b) => `${b.facility_id}|${b.payer_name}`);

  return Object.entries(grouped).map(([key, payerBreakdowns]) => {
    const [facility_id, payer_name] = key.split('|');

    // Sum up all metrics across dates
    const total_orders = payerBreakdowns.reduce((sum, p) => sum + p.total_orders, 0);
    const orders_active = payerBreakdowns.reduce((sum, p) => sum + p.orders_active, 0);
    const orders_inactive = payerBreakdowns.reduce((sum, p) => sum + p.orders_inactive, 0);
    const orders_unknown = payerBreakdowns.reduce((sum, p) => sum + p.orders_unknown, 0);
    const ev_completed = payerBreakdowns.reduce((sum, p) => sum + p.ev_completed, 0);
    const ev_in_progress = payerBreakdowns.reduce((sum, p) => sum + p.ev_in_progress, 0);
    const ev_error_total = payerBreakdowns.reduce((sum, p) => sum + p.ev_error_total, 0);

    // Recalculate percentages based on aggregated totals
    const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
    const pct_inactive = total_orders > 0 ? (orders_inactive / total_orders) * 100 : 0;
    const pct_unknown = total_orders > 0 ? (orders_unknown / total_orders) * 100 : 0;
    const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
    const pct_in_progress = total_orders > 0 ? (ev_in_progress / total_orders) * 100 : 0;
    const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

    return {
      created_at_date: '', // No single date for aggregated data
      facility_id,
      payer_name,
      total_orders,
      orders_active,
      orders_inactive,
      orders_unknown,
      ev_completed,
      ev_in_progress,
      ev_error_total,
      pct_active: Math.round(pct_active * 10) / 10,
      pct_inactive: Math.round(pct_inactive * 10) / 10,
      pct_unknown: Math.round(pct_unknown * 10) / 10,
      pct_completed: Math.round(pct_completed * 10) / 10,
      pct_in_progress: Math.round(pct_in_progress * 10) / 10,
      pct_error: Math.round(pct_error * 10) / 10,
    };
  });
}

// ============================================================================
// METRIC THRESHOLDS & STATUS
// ============================================================================

/**
 * Get status color for a metric based on thresholds
 */
export function getMetricStatus(
  metricName: 'ev_success_rate' | 'active_coverage_rate' | 'error_rate',
  value: number
): 'good' | 'warning' | 'critical' {
  if (metricName === 'error_rate') {
    // Inverted: lower is better
    if (value <= 5) return 'good';
    if (value <= 10) return 'warning';
    return 'critical';
  } else {
    // Standard: higher is better
    if (metricName === 'ev_success_rate') {
      if (value >= 95) return 'good';
      if (value >= 90) return 'warning';
      return 'critical';
    } else if (metricName === 'active_coverage_rate') {
      if (value >= 80) return 'good';
      if (value >= 70) return 'warning';
      return 'critical';
    }
  }

  return 'warning';
}
