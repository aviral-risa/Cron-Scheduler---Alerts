/**
 * Metrics Validation Utilities
 * Validate data integrity for business metrics
 */

import type { BusinessMetrics, StatusBreakdown } from '@/types/business';

/**
 * Validate that the sum of all status fields equals total orders worked
 * @param summary Business metrics summary containing status breakdown
 * @returns StatusBreakdown object with validation results
 */
export function validateStatusBreakdown(summary: BusinessMetrics): StatusBreakdown {
  // Sum all 11 status fields
  const sumOfStatuses =
    summary.authByRisa +
    summary.authOnFile +
    summary.noAuthRequired +
    summary.denialByRisa +
    summary.denialAfterQuery +
    summary.existingDenial +
    summary.query +
    summary.pending +
    summary.hold +
    summary.authRequired +
    summary.other;

  const totalOrdersWorked = summary.totalOrdersWorked;
  const validationMatch = sumOfStatuses === totalOrdersWorked;
  const discrepancy = totalOrdersWorked - sumOfStatuses;

  return {
    sumOfStatuses,
    totalOrdersWorked,
    validationMatch,
    discrepancy,
  };
}
