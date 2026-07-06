/**
 * Agent Mode Metrics Types
 *
 * Type definitions for tracking Agent Mode order completion metrics:
 * - Order completion by Human vs Agent vs In Progress
 * - NAR Agent Mode review status (Pass/Fail)
 * - Plan-level Medical Order Status breakdown for NAR orders
 */

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

/**
 * Medical Order Status values
 */
export const MEDICAL_ORDER_STATUS = {
  COMPLETED_BY_AGENT: 'order_completed_by_agent',
  COMPLETED_BY_HUMAN: 'order_completed_by_human',
  IN_PROGRESS: 'order_in_progress',
  YET_TO_START: 'yet_to_start_work_on_order',
} as const;

export type MedicalOrderStatus = typeof MEDICAL_ORDER_STATUS[keyof typeof MEDICAL_ORDER_STATUS];

/**
 * Medical Order Review Status values
 */
export const MEDICAL_ORDER_REVIEW_STATUS = {
  PASSED: 'order_passed',
  REJECTED: 'order_rejected',
  PENDING: 'agent_order_review_pending',
  NOT_REQUIRED: 'agent_order_review_not_required',
} as const;

export type MedicalOrderReviewStatus = typeof MEDICAL_ORDER_REVIEW_STATUS[keyof typeof MEDICAL_ORDER_REVIEW_STATUS];

/**
 * NAR identification: auth_status = 'no_auth_required'
 */
export const NAR_AUTH_STATUS = 'no_auth_required';

// ============================================================================
// FILTERS
// ============================================================================

/**
 * Filter options for Agent Mode metrics queries
 */
export interface AgentModeMetricsFilters {
  organizationIds: string[];  // Empty array = all orgs
  dateRange: {
    startDate: string;  // YYYY-MM-DD
    endDate: string;    // YYYY-MM-DD
  };
}

// ============================================================================
// OVERVIEW METRICS
// ============================================================================

/**
 * Section 1: Order Completion Overview
 * Aggregated metrics across selected orgs and date range
 */
export interface AgentModeOverview {
  // Total counts
  totalOrders: number;
  completedByAgent: number;
  completedByHuman: number;
  inProgress: number;
  yetToStart: number;

  // Agent orders with review status
  agentReviewPassed: number;
  agentReviewRejected: number;
  agentReviewPending: number;
  agentReviewNotRequired: number;

  // Calculated percentages
  agentCompletionPct: number;  // Agent / (Agent + Human) × 100
  noTouchPct: number;          // (Agent orders with review passed) / (Completed + In Progress) × 100
}

// ============================================================================
// NAR AGENT MODE REVIEW ANALYSIS
// ============================================================================

/**
 * Section 2: NAR Agent Mode - Review Analysis
 * For orders where auth_status = 'no_auth_required' AND medical_order_status = 'order_completed_by_agent'
 */
export interface NARAgentReviewAnalysis {
  // Filter: NAR orders completed by Agent
  totalNARAgentCompleted: number;

  // Review status breakdown
  reviewPassed: number;
  reviewRejected: number;
  reviewPending: number;
  reviewNotRequired: number;

  // Calculated rate
  passRatePct: number;  // Passed / (Passed + Rejected) × 100
}

// ============================================================================
// NAR ORDERS BY PLAN
// ============================================================================

/**
 * Section 3: NAR Orders - Medical Order Status by Plan Name
 * Breakdown at primary_payer_name level for NAR orders
 */
export interface NAROrdersByPlan {
  planName: string;  // primary_payer_name
  completedByAgent: number;
  completedByHuman: number;
  inProgress: number;
  yetToStart: number;
  total: number;
}

// ============================================================================
// L7D TREND DATA
// ============================================================================

/**
 * Daily trend of ALL orders by status
 */
export interface AllOrdersDailyTrend {
  date: string; // YYYY-MM-DD
  yetToStart: number;
  pending: number; // Maps to inProgress
  completedByHuman: number;
  completedByAgent: number;
  totalOrders: number;
}

/**
 * Daily trend of NAR orders by status
 */
export interface NARAgentDailyTrend {
  date: string; // YYYY-MM-DD
  yetToStart: number;
  pending: number; // Maps to inProgress
  completedByHuman: number;
  completedByAgent: number;
  totalNAR: number;
}

/**
 * L7D average for NAR order trends
 */
export interface NARAgentL7DAverage {
  date: string; // "L7D Avg"
  yetToStart: number;
  pending: number;
  completedByHuman: number;
  completedByAgent: number;
  totalNAR: number;
}

/**
 * Daily review status breakdown
 */
export interface NARAgentReviewDaily {
  date: string; // YYYY-MM-DD
  totalNARAgentCompleted: number;
  reviewPassed: number;
  reviewRejected: number;
  reviewPending: number;
  reviewNotRequired: number;
  passRatePct: number;
}

/**
 * L7D average for review metrics
 */
export interface NARAgentReviewL7DAverage {
  date: string; // "L7D Avg"
  totalNARAgentCompleted: number;
  reviewPassed: number;
  reviewRejected: number;
  reviewPending: number;
  reviewNotRequired: number;
  passRatePct: number;
}

// ============================================================================
// AGGREGATED RESPONSE
// ============================================================================

/**
 * Complete Agent Mode metrics response
 */
export interface AgentModeMetricsData {
  overview: AgentModeOverview;
  narAgentReview: NARAgentReviewAnalysis;
  narOrdersByPlan: NAROrdersByPlan[];
  allOrdersDailyTrend: AllOrdersDailyTrend[];     // NEW: All orders daily trend
  narDailyTrend: NARAgentDailyTrend[];           // NEW
  narL7DAverage: NARAgentL7DAverage | null;       // NEW
  narReviewDaily: NARAgentReviewDaily[];          // NEW
  narReviewL7DAverage: NARAgentReviewL7DAverage | null; // NEW
}

// ============================================================================
// API RESPONSE
// ============================================================================

/**
 * API response wrapper
 */
export interface AgentModeMetricsResponse {
  success: boolean;
  data: AgentModeMetricsData | null;
  error?: string;
}

// ============================================================================
// METRIC THRESHOLDS (for color coding)
// ============================================================================

export interface AgentModeMetricThreshold {
  good: number;     // Green if >= this value
  warning: number;  // Yellow if >= this value
  critical: number; // Red if < this value
}

export const AGENT_MODE_METRIC_THRESHOLDS = {
  agentCompletionPct: { good: 80, warning: 60, critical: 60 },  // >80% = good
  noTouchPct: { good: 70, warning: 50, critical: 50 },          // >70% = good
  passRatePct: { good: 95, warning: 85, critical: 85 },         // >95% = good
} as const;
