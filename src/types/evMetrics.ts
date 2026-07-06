/**
 * EV (Eligibility Verification) Metrics Types
 *
 * This file contains type definitions for tracking EV service health metrics
 * including coverage status, EV completion status, and error tracking.
 */

// ============================================================================
// BRONZE LAYER - Raw Data from Algolia
// ============================================================================

/**
 * Raw EV snapshot for a single order
 * Stored in: ev_raw_snapshots sheet
 * Source: Algolia API
 */
export interface EVOrderSnapshot {
  snapshot_timestamp: string;      // IST timestamp when snapshot was taken (e.g., "2026-01-13 10:15:32")
  snapshot_hour_ist: string;       // IST hour as string (e.g., "10", "14", "18")
  snapshot_date: string;            // IST date (YYYY-MM-DD)
  order_id: string;                 // Unique order identifier
  facility_id: string;              // Organization facility ID
  created_at_date: string;          // Date order was created (YYYY-MM-DD)

  // From Algolia EV fields
  primary_active: 'active' | 'inactive' | 'unknown' | null;  // Coverage status
  primary_payer_name: string | null;                          // Insurance payer name
  ev_bv_primary: string | null;                               // EV service status (completed/in_progress/error_*)
}

// ============================================================================
// SILVER LAYER - Calculated Daily Metrics
// ============================================================================

/**
 * Daily aggregated EV metrics per organization
 * Calculated from: ev_raw_snapshots (deduplicated by order_id, latest snapshot)
 * Used for: Daily trend views, 7-30 day analysis
 */
export interface EVDailySummary {
  created_at_date: string;          // Date orders were created (YYYY-MM-DD)
  facility_id: string;              // Organization facility ID

  // Coverage Metrics
  total_orders: number;             // Total unique orders with EV data
  orders_active: number;            // Orders with active coverage
  orders_inactive: number;          // Orders with inactive coverage
  orders_unknown: number;           // Orders with unknown/null coverage

  // EV Service Status Metrics
  ev_completed: number;             // EV service completed successfully
  ev_in_progress: number;           // EV service still in progress
  ev_error_total: number;           // Total EV service errors

  // Error Breakdown (dynamically classified)
  ev_error_timeout: number;         // Timeout errors
  ev_error_auth: number;            // Authentication/authorization errors
  ev_error_network: number;         // Network/communication errors
  ev_error_validation: number;      // Data validation errors
  ev_error_type_not_supported: number; // EV type not supported by payer
  ev_error_rate_limit: number;      // Rate limiting/maxed out errors
  ev_error_other: number;           // All other error types

  // Percentage Metrics (calculated on-demand, not stored)
  pct_active: number;               // (orders_active / total_orders) * 100
  pct_inactive: number;             // (orders_inactive / total_orders) * 100
  pct_completed: number;            // (ev_completed / total_orders) * 100
  pct_error: number;                // (ev_error_total / total_orders) * 100

  last_updated_timestamp: string;   // When summary was calculated (IST)
}

/**
 * Hourly EV metrics for intraday trend analysis
 * Calculated from: ev_raw_snapshots (grouped by hour)
 * Used for: Hourly trend chart showing progression throughout the day
 */
export interface EVHourlyMetrics {
  created_at_date: string;          // Date orders were created (YYYY-MM-DD)
  facility_id: string;              // Organization facility ID
  snapshot_hour_ist: string;        // Hour of snapshot (e.g., "10", "12", "14")
  snapshot_hour_label: string;      // Formatted hour (e.g., "10:00 AM")

  // Same metrics as daily summary but for specific hour
  total_orders: number;
  orders_active: number;
  orders_inactive: number;
  orders_unknown: number;

  ev_completed: number;
  ev_in_progress: number;
  ev_error_total: number;

  pct_active: number;
  pct_completed: number;
  pct_error: number;
}

// ============================================================================
// GOLD LAYER - Payer-Level Analysis
// ============================================================================

/**
 * Payer-level (insurance company) breakdown of EV metrics
 * Calculated from: ev_raw_snapshots (grouped by payer_name)
 * Used for: Payer breakdown table
 */
export interface EVPayerBreakdown {
  created_at_date: string;          // Date orders were created (YYYY-MM-DD)
  facility_id: string;              // Organization facility ID
  payer_name: string;               // Insurance payer name (e.g., "Aetna", "BCBS")

  // Counts
  total_orders: number;             // Total orders for this payer
  orders_active: number;            // Active coverage orders
  orders_inactive: number;          // Inactive coverage orders
  orders_unknown: number;           // Unknown coverage orders

  ev_completed: number;             // EV completed
  ev_in_progress: number;           // EV in progress
  ev_error_total: number;           // EV errors

  // Percentages
  pct_active: number;               // (orders_active / total_orders) * 100
  pct_inactive: number;             // (orders_inactive / total_orders) * 100
  pct_unknown: number;              // (orders_unknown / total_orders) * 100
  pct_completed: number;            // (ev_completed / total_orders) * 100
  pct_in_progress: number;          // (ev_in_progress / total_orders) * 100
  pct_error: number;                // (ev_error_total / total_orders) * 100
}

// ============================================================================
// CHART DATA TYPES
// ============================================================================

/**
 * Data point for daily trend chart
 * Shows metrics over multiple days
 */
export interface EVTrendDataPoint {
  date: string;                     // YYYY-MM-DD
  displayLabel: string;             // Formatted date (e.g., "Jan 13")
  pct_active: number;               // % orders with active coverage
  pct_inactive: number;             // % orders with inactive coverage
  pct_completed: number;            // % EV completed
  pct_error: number;                // % EV errors
}

/**
 * Data point for hourly trend chart
 * Shows intraday progression
 */
export interface EVHourlyTrendDataPoint {
  hour: string;                     // Hour label (e.g., "10:00 AM")
  hour_ist: string;                 // Hour as number string (e.g., "10")
  pct_active: number;               // % orders with active coverage
  pct_completed: number;            // % EV completed
  pct_in_progress: number;          // % EV in progress
  pct_error: number;                // % EV errors
}

/**
 * Error breakdown by type
 * For pie/bar charts showing error distribution
 */
export interface EVErrorBreakdown {
  error_type: string;               // Error category name
  count: number;                    // Number of errors
  percentage: number;               // % of total errors
}

// ============================================================================
// FILTERS
// ============================================================================

/**
 * Filter options for EV metrics queries
 */
export interface EVMetricsFilters {
  organizationIds: string[];        // Empty array = all orgs
  dateRange: {
    startDate: string;              // YYYY-MM-DD
    endDate: string;                // YYYY-MM-DD
  };
}

/**
 * Filters for hourly view (single date)
 */
export interface EVHourlyFilters {
  organizationIds: string[];        // Empty array = all orgs
  date: string;                     // YYYY-MM-DD (single date only)
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response from sync operation
 */
export interface EVSyncResponse {
  success: boolean;
  recordsSynced: number;
  facilitiesProcessed: string[];
  error?: string;
  timestamp: string;
}

/**
 * Aggregated summary across all selected orgs/dates
 * Used for overview cards (top 3 A0 metrics)
 */
export interface EVAggregatedSummary {
  total_orders: number;
  orders_active: number;
  orders_inactive: number;

  ev_completed: number;
  ev_in_progress: number;
  ev_error_total: number;

  // Key Metrics (A0)
  ev_success_rate: number;          // (ev_completed / total_orders) * 100 - Target: >95%
  active_coverage_rate: number;     // (orders_active / total_orders) * 100 - Target: >80%
  error_rate: number;               // (ev_error_total / total_orders) * 100 - Target: <5%

  // Error breakdown
  error_breakdown: EVErrorBreakdown[];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Error classification result
 */
export type EVErrorType =
  | 'timeout'
  | 'auth'
  | 'network'
  | 'validation'
  | 'type_not_supported'
  | 'rate_limit'
  | 'other';

/**
 * Metric status thresholds for color coding
 */
export interface EVMetricThreshold {
  good: number;                     // Green if >= this value
  warning: number;                  // Yellow if >= this value
  critical: number;                 // Red if < this value
}

/**
 * Thresholds for the 3 A0 metrics
 */
export const EV_METRIC_THRESHOLDS = {
  ev_success_rate: { good: 95, warning: 90, critical: 90 },      // >95% = good
  active_coverage_rate: { good: 80, warning: 70, critical: 70 },  // >80% = good
  error_rate: { good: 5, warning: 10, critical: 10 },            // <5% = good (inverted)
} as const;
