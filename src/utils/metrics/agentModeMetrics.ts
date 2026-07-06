/**
 * Agent Mode Metrics Calculation Utilities
 *
 * Functions for calculating Agent Mode metrics from unique_orders_status data
 */

import type { UniqueOrderStatus } from '../../types/orders';
import type {
  AgentModeOverview,
  NARAgentReviewAnalysis,
  NAROrdersByPlan,
  AgentModeMetricsData,
} from '../../types/agentModeMetrics';
import {
  MEDICAL_ORDER_STATUS,
  MEDICAL_ORDER_REVIEW_STATUS,
  NAR_AUTH_STATUS,
} from '../../types/agentModeMetrics';

/**
 * Calculate Agent Mode Overview metrics
 */
export function calculateAgentModeOverview(orders: UniqueOrderStatus[]): AgentModeOverview {
  // Count by medical_order_status
  const completedByAgent = orders.filter(
    (o) => o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT
  ).length;

  const completedByHuman = orders.filter(
    (o) => o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN
  ).length;

  const inProgress = orders.filter(
    (o) => o.medical_order_status === MEDICAL_ORDER_STATUS.IN_PROGRESS
  ).length;

  const yetToStart = orders.filter(
    (o) => o.medical_order_status === MEDICAL_ORDER_STATUS.YET_TO_START
  ).length;

  // Count agent orders by review status
  const agentOrders = orders.filter(
    (o) => o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT
  );

  const agentReviewPassed = agentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.PASSED
  ).length;

  const agentReviewRejected = agentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.REJECTED
  ).length;

  const agentReviewPending = agentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.PENDING
  ).length;

  const agentReviewNotRequired = agentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.NOT_REQUIRED
  ).length;

  // Calculate percentages
  const totalCompleted = completedByAgent + completedByHuman;
  const agentCompletionPct =
    totalCompleted > 0 ? (completedByAgent / totalCompleted) * 100 : 0;

  // No Touch = (Agent orders with review passed) / (Completed + In Progress)
  const completedAndInProgress = completedByAgent + completedByHuman + inProgress;
  const noTouchPct =
    completedAndInProgress > 0 ? (agentReviewPassed / completedAndInProgress) * 100 : 0;

  return {
    totalOrders: orders.length,
    completedByAgent,
    completedByHuman,
    inProgress,
    yetToStart,
    agentReviewPassed,
    agentReviewRejected,
    agentReviewPending,
    agentReviewNotRequired,
    agentCompletionPct: Math.round(agentCompletionPct * 10) / 10,
    noTouchPct: Math.round(noTouchPct * 10) / 10,
  };
}

/**
 * Calculate NAR Agent Mode Review Analysis
 * Filter: auth_status = 'no_auth_required' AND medical_order_status = 'order_completed_by_agent'
 */
export function calculateNARAgentReviewAnalysis(orders: UniqueOrderStatus[]): NARAgentReviewAnalysis {
  // Filter NAR orders completed by Agent
  const narAgentOrders = orders.filter(
    (o) =>
      o.auth_status === NAR_AUTH_STATUS &&
      o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT
  );

  const totalNARAgentCompleted = narAgentOrders.length;

  // Review status breakdown
  const reviewPassed = narAgentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.PASSED
  ).length;

  const reviewRejected = narAgentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.REJECTED
  ).length;

  const reviewPending = narAgentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.PENDING
  ).length;

  const reviewNotRequired = narAgentOrders.filter(
    (o) => o.medical_order_review_status === MEDICAL_ORDER_REVIEW_STATUS.NOT_REQUIRED
  ).length;

  // Calculate pass rate
  const totalReviewed = reviewPassed + reviewRejected;
  const passRatePct = totalReviewed > 0 ? (reviewPassed / totalReviewed) * 100 : 0;

  return {
    totalNARAgentCompleted,
    reviewPassed,
    reviewRejected,
    reviewPending,
    reviewNotRequired,
    passRatePct: Math.round(passRatePct * 10) / 10,
  };
}

/**
 * Calculate NAR Orders by Plan Name
 * Filter: auth_status = 'no_auth_required'
 * Group by: primary_payer_name
 */
export function calculateNAROrdersByPlan(orders: UniqueOrderStatus[]): NAROrdersByPlan[] {
  // Filter NAR orders
  const narOrders = orders.filter((o) => o.auth_status === NAR_AUTH_STATUS);

  // Group by plan name
  const planMap = new Map<string, NAROrdersByPlan>();

  for (const order of narOrders) {
    const planName = order.primary_payer_name || 'Unknown';

    if (!planMap.has(planName)) {
      planMap.set(planName, {
        planName,
        completedByAgent: 0,
        completedByHuman: 0,
        inProgress: 0,
        yetToStart: 0,
        total: 0,
      });
    }

    const plan = planMap.get(planName)!;
    plan.total++;

    switch (order.medical_order_status) {
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT:
        plan.completedByAgent++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN:
        plan.completedByHuman++;
        break;
      case MEDICAL_ORDER_STATUS.IN_PROGRESS:
        plan.inProgress++;
        break;
      case MEDICAL_ORDER_STATUS.YET_TO_START:
        plan.yetToStart++;
        break;
    }
  }

  // Convert map to array and sort by total (descending)
  return Array.from(planMap.values()).sort((a, b) => b.total - a.total);
}

/**
 * Calculate all Agent Mode metrics from orders
 * Note: L7D trend data is calculated server-side from daily aggregates
 */
export function calculateAgentModeMetrics(orders: UniqueOrderStatus[]): AgentModeMetricsData {
  return {
    overview: calculateAgentModeOverview(orders),
    narAgentReview: calculateNARAgentReviewAnalysis(orders),
    narOrdersByPlan: calculateNAROrdersByPlan(orders),
    // L7D data should be provided by the API endpoint
    allOrdersDailyTrend: [],
    narDailyTrend: [],
    narL7DAverage: null,
    narReviewDaily: [],
    narReviewL7DAverage: null,
  };
}

/**
 * Filter orders by date range and organization IDs
 */
export function filterOrders(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string,
  organizationIds: string[]
): UniqueOrderStatus[] {
  return orders.filter((order) => {
    // Exclude duplicate orders
    if (order.is_duplicate) return false;

    // Extract date from ISO timestamp
    const orderDate = order.created_at_iso?.split('T')[0]?.split(' ')[0] || '';

    // Filter by date range
    if (orderDate < startDate || orderDate > endDate) {
      return false;
    }

    // Filter by organization (if specified)
    if (organizationIds.length > 0 && !organizationIds.includes(order.org_id)) {
      return false;
    }

    return true;
  });
}
