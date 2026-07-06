/**
 * RPA (Robotic Process Automation) Metrics Types
 *
 * This file contains type definitions for tracking RPA health metrics
 * including Comment RPA, Document RPA, and Health First NAR RPA success/failure rates.
 */

// ============================================================================
// BRONZE LAYER - Raw Data from Algolia
// ============================================================================

/**
 * Raw RPA snapshot for a single order
 * Stored in: rpa_raw_snapshots sheet
 * Source: Algolia API
 */
export interface RPAOrderSnapshot {
  snapshot_timestamp: string;           // IST timestamp when snapshot was taken (e.g., "2026-01-13 10:15:32")
  order_id: string;                     // Unique order identifier
  org_id: string;                       // Organization/facility ID
  created_at: string;                   // Order creation timestamp (ISO)
  username: string;                     // assigned_to.provider_name
  master_auth_status: string;           // Main authorization status (e.g., 'auth_by_risa', 'new', etc.)

  // RPA status fields from Algolia
  ev_write_back_status: string;         // Comment RPA: 'not_initiated' | 'success' | 'error'
  document_upload_status: string;       // Document RPA: 'not_initiated' | 'success' | 'error'
  health_first_nar_rpa_status: string;  // Health First NAR RPA: 'not_initiated' | 'success' | 'error'

  date_of_work: string | null;          // When order was completed (ISO)
  assigned_to: string;                  // Who order is assigned to
  is_worked: boolean;                   // master_auth_status !== 'new'
}

// ============================================================================
// SILVER LAYER - Daily Aggregated Metrics
// ============================================================================

/**
 * Daily aggregated RPA metrics per organization
 * Calculated from: rpa_raw_snapshots (deduplicated by order_id, latest snapshot)
 * Used for: Daily trend views, 7-30 day analysis
 */
export interface RPADailySummary {
  date: string;                         // Date of work (YYYY-MM-DD)
  facility_id: string;                  // Organization facility ID

  // Total counts
  total_orders_worked: number;          // is_worked = true

  // Comment RPA (ev_write_back_status)
  comment_rpa_triggered: number;        // not 'not_initiated'
  comment_rpa_success: number;          // 'success'
  comment_rpa_error: number;            // 'error'
  comment_rpa_not_initiated: number;    // 'not_initiated'

  // Document RPA (document_upload_status)
  document_rpa_triggered: number;
  document_rpa_success: number;
  document_rpa_error: number;
  document_rpa_not_initiated: number;

  // Health First NAR RPA (health_first_nar_rpa_status)
  hf_nar_rpa_triggered: number;
  hf_nar_rpa_success: number;
  hf_nar_rpa_error: number;
  hf_nar_rpa_not_initiated: number;

  // Document compliance (auth_by_risa orders)
  auth_by_risa_count: number;           // master_auth_status = 'auth_by_risa'
  auth_by_risa_doc_uploaded: number;    // auth_by_risa + document_upload_status != 'not_initiated'
  auth_by_risa_doc_missing: number;     // auth_by_risa + document_upload_status = 'not_initiated'

  // Percentages
  pct_comment_rpa_triggered: number;    // (comment_rpa_triggered / total_orders_worked) * 100
  pct_comment_rpa_success: number;      // (comment_rpa_success / total_orders_worked) * 100
  pct_document_rpa_triggered: number;
  pct_document_rpa_success: number;
  pct_document_compliance: number;      // (auth_by_risa_doc_uploaded / auth_by_risa_count) * 100
  pct_overall_rpa_failure: number;      // ((comment_rpa_error + document_rpa_error) / total_orders_worked) * 100
}

// ============================================================================
// GOLD LAYER - User Breakdown
// ============================================================================

/**
 * User-level (per username) breakdown of RPA metrics
 * Calculated from: rpa_raw_snapshots (grouped by username)
 * Used for: User breakdown table
 */
export interface RPAUserBreakdown {
  date_range: string;                   // "YYYY-MM-DD to YYYY-MM-DD"
  facility_id: string;                  // Organization facility ID
  username: string;                     // User name

  total_orders: number;
  comment_rpa_manual: number;           // not_initiated count
  comment_rpa_automated: number;        // success + error
  document_rpa_manual: number;
  document_rpa_automated: number;

  pct_comment_automation: number;       // (comment_rpa_automated / total_orders) * 100
  pct_document_automation: number;
}

// ============================================================================
// CHART DATA TYPES
// ============================================================================

/**
 * Data point for daily trend chart
 * Shows RPA metrics over multiple days
 */
export interface RPATrendDataPoint {
  date: string;                         // YYYY-MM-DD
  displayLabel: string;                 // Formatted date (e.g., "Jan 13")
  comment_rpa_success_rate: number;     // %
  document_rpa_success_rate: number;    // %
  rpa_failure_rate: number;             // %
  document_compliance_rate: number;     // %
}

/**
 * Data point for hourly trend chart
 * Shows RPA failures by hour (for spike detection)
 */
export interface RPAHourlyDataPoint {
  hour: string;                         // "10:00 AM"
  hour_ist: string;                     // "10"
  comment_rpa_failures: number;
  document_rpa_failures: number;
  hf_nar_rpa_failures: number;
  total_failures: number;
}

// ============================================================================
// FILTERS
// ============================================================================

/**
 * Filter options for RPA metrics queries
 */
export interface RPAMetricsFilters {
  organizationIds: string[];            // Empty array = all orgs
  dateRange: {
    startDate: string;                  // YYYY-MM-DD
    endDate: string;                    // YYYY-MM-DD
  };
  usernames?: string[];                 // Optional user filter
  rpaStatus?: ('not_initiated' | 'success' | 'error')[];
}

/**
 * Filters for hourly view (single date)
 */
export interface RPAHourlyFilters {
  organizationIds: string[];            // Empty array = all orgs
  date: string;                         // YYYY-MM-DD (single date only)
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response from sync operation
 */
export interface RPASyncResponse {
  success: boolean;
  recordsSynced: number;
  facilitiesProcessed: string[];
  error?: string;
  timestamp: string;
}

/**
 * Aggregated summary across all selected orgs/dates
 * Used for overview cards (top 4 A0 metrics)
 */
export interface RPAAggregatedSummary {
  total_orders_worked: number;

  // Key Metrics (A0)
  comment_rpa_automation_rate: number;  // % orders with Comment RPA triggered
  document_rpa_automation_rate: number; // % orders with Document RPA triggered
  overall_rpa_success_rate: number;     // % RPA operations successful
  document_compliance_rate: number;     // % auth_by_risa with document upload

  // Breakdown
  comment_rpa_success: number;
  comment_rpa_error: number;
  document_rpa_success: number;
  document_rpa_error: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * RPA status type
 */
export type RPAStatus = 'not_initiated' | 'success' | 'error';

/**
 * Metric status thresholds for color coding
 */
export interface RPAMetricThreshold {
  good: number;                         // Green if >= this value
  warning: number;                      // Yellow if >= this value
  critical: number;                     // Red if < this value
}

/**
 * Thresholds for the 4 A0 metrics
 */
export const RPA_METRIC_THRESHOLDS = {
  comment_rpa_automation_rate: { good: 80, warning: 60, critical: 60 },      // >80% = good
  document_rpa_automation_rate: { good: 80, warning: 60, critical: 60 },     // >80% = good
  overall_rpa_success_rate: { good: 95, warning: 90, critical: 90 },         // >95% = good
  document_compliance_rate: { good: 95, warning: 90, critical: 90 },         // >95% = good
} as const;
