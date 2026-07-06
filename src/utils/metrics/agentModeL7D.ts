/**
 * Agent Mode L7D Calculation Utilities
 *
 * Utilities for calculating Last 7 Days (L7D) averages for Agent Mode metrics
 */

import type {
  NARAgentDailyTrend,
  NARAgentL7DAverage,
  NARAgentReviewDaily,
  NARAgentReviewL7DAverage
} from '@/types/agentModeMetrics';

/**
 * Calculate L7D average for order status trends
 */
export function calculateOrderStatusL7DAverage(
  dailyTrends: NARAgentDailyTrend[]
): NARAgentL7DAverage {
  const count = dailyTrends.length;
  if (count === 0) {
    return {
      date: 'L7D Avg',
      yetToStart: 0,
      pending: 0,
      completedByHuman: 0,
      completedByAgent: 0,
      totalNAR: 0,
    };
  }

  const sum = dailyTrends.reduce(
    (acc, day) => ({
      yetToStart: acc.yetToStart + day.yetToStart,
      pending: acc.pending + day.pending,
      completedByHuman: acc.completedByHuman + day.completedByHuman,
      completedByAgent: acc.completedByAgent + day.completedByAgent,
      totalNAR: acc.totalNAR + day.totalNAR,
    }),
    { yetToStart: 0, pending: 0, completedByHuman: 0, completedByAgent: 0, totalNAR: 0 }
  );

  return {
    date: 'L7D Avg',
    yetToStart: Math.round(sum.yetToStart / count),
    pending: Math.round(sum.pending / count),
    completedByHuman: Math.round(sum.completedByHuman / count),
    completedByAgent: Math.round(sum.completedByAgent / count),
    totalNAR: Math.round(sum.totalNAR / count),
  };
}

/**
 * Calculate L7D average for review metrics
 */
export function calculateReviewL7DAverage(
  dailyReviews: NARAgentReviewDaily[]
): NARAgentReviewL7DAverage {
  const count = dailyReviews.length;
  if (count === 0) {
    return {
      date: 'L7D Avg',
      totalNARAgentCompleted: 0,
      reviewPassed: 0,
      reviewRejected: 0,
      reviewPending: 0,
      reviewNotRequired: 0,
      passRatePct: 0,
    };
  }

  const sum = dailyReviews.reduce(
    (acc, day) => ({
      totalNARAgentCompleted: acc.totalNARAgentCompleted + day.totalNARAgentCompleted,
      reviewPassed: acc.reviewPassed + day.reviewPassed,
      reviewRejected: acc.reviewRejected + day.reviewRejected,
      reviewPending: acc.reviewPending + day.reviewPending,
      reviewNotRequired: acc.reviewNotRequired + day.reviewNotRequired,
    }),
    {
      totalNARAgentCompleted: 0,
      reviewPassed: 0,
      reviewRejected: 0,
      reviewPending: 0,
      reviewNotRequired: 0
    }
  );

  const avgPassed = Math.round(sum.reviewPassed / count);
  const avgRejected = Math.round(sum.reviewRejected / count);
  const passRate = avgPassed + avgRejected > 0
    ? (avgPassed / (avgPassed + avgRejected)) * 100
    : 0;

  return {
    date: 'L7D Avg',
    totalNARAgentCompleted: Math.round(sum.totalNARAgentCompleted / count),
    reviewPassed: avgPassed,
    reviewRejected: avgRejected,
    reviewPending: Math.round(sum.reviewPending / count),
    reviewNotRequired: Math.round(sum.reviewNotRequired / count),
    passRatePct: passRate,
  };
}
