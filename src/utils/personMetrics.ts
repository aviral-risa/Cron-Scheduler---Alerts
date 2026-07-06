/**
 * Person Metrics Utility Functions
 * Calculations for active providers, productivity, rolling averages, and performance status
 */

import type { PersonMetrics } from '@/types/orders';
import type { DailyBusinessMetrics } from '@/types/business';

/**
 * Calculate number of active providers based on worked count threshold
 * @param personMetrics Array of person metrics for a given day/organization
 * @param threshold Minimum number of orders worked to count as active (default: 10)
 * @returns Count of providers who worked >= threshold orders (excludes Risa Agent)
 */
export function calculateActiveProviders(
  personMetrics: PersonMetrics[],
  threshold: number = 10
): number {
  if (!personMetrics || personMetrics.length === 0) {
    return 0;
  }

  return personMetrics.filter((pm) =>
    pm.worked_count >= threshold &&
    pm.provider_name !== 'Risa Agent'  // Exclude Risa Agent from active user count
  ).length;
}

/**
 * Calculate orders per person (productivity metric)
 * @param ordersWorked Total orders worked
 * @param activeProviders Number of active providers
 * @returns Orders per person, or null if division by zero
 */
export function calculateOrdersPerPerson(
  ordersWorked: number,
  activeProviders: number
): number | null {
  if (activeProviders === 0) {
    return null;
  }

  const ordersPerPerson = ordersWorked / activeProviders;
  return parseFloat(ordersPerPerson.toFixed(1));
}

/**
 * Calculate 7-day rolling average for orders worked
 * @param dailyData Array of daily business metrics (sorted chronologically)
 * @param currentIndex Index of the current day
 * @param window Rolling window size in days (default: 7)
 * @returns Rolling average (rounded to nearest integer)
 */
export function calculateRollingAverage(
  dailyData: DailyBusinessMetrics[],
  currentIndex: number,
  window: number = 7
): number {
  // Look back up to 'window' days (inclusive of current day)
  const startIndex = Math.max(0, currentIndex - window + 1);
  const relevantDays = dailyData.slice(startIndex, currentIndex + 1);

  const sum = relevantDays.reduce((acc, day) => acc + day.ordersWorked, 0);
  const count = relevantDays.length;

  return count > 0 ? Math.round(sum / count) : 0;
}

/**
 * Calculate variance from average (both absolute and percentage)
 * @param current Current value
 * @param average Average value to compare against
 * @returns Object with absolute variance and percentage variance
 */
export function calculateVariance(
  current: number,
  average: number
): { absolute: number; percentage: number } {
  const absolute = current - average;

  if (average === 0) {
    return { absolute, percentage: 0 };
  }

  const percentage = (absolute / average) * 100;
  return {
    absolute,
    percentage: parseFloat(percentage.toFixed(1)),
  };
}

/**
 * Determine performance status based on variance percentage
 * @param variancePercentage Percentage variance from average
 * @returns Performance status: 'above' (green), 'normal' (gray), or 'below' (red)
 */
export function determinePerformanceStatus(
  variancePercentage: number | null
): 'above' | 'normal' | 'below' {
  if (variancePercentage === null) {
    return 'normal';
  }

  // Thresholds: >+5% = above (green), <-5% = below (red), else = normal (gray)
  if (variancePercentage > 5) {
    return 'above';
  }
  if (variancePercentage < -5) {
    return 'below';
  }
  return 'normal';
}
