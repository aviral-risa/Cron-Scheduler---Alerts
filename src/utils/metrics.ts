/**
 * Utility functions for percentage calculations and metric formatting
 */

/**
 * Calculate percentage with division by zero handling
 * Returns null if denominator is 0
 * @param numerator - The numerator value
 * @param denominator - The denominator value
 * @param decimalPlaces - Number of decimal places (default: 1)
 */
export function calculatePercentage(
  numerator: number,
  denominator: number,
  decimalPlaces: number = 1
): number | null {
  if (denominator === 0) return null;
  const percentage = (numerator / denominator) * 100;
  return parseFloat(percentage.toFixed(decimalPlaces));
}

/**
 * Calculate % Orders Worked of Orders Assigned
 * Returns percentage rounded to 1 decimal place
 */
export function calcWorkedOfAssigned(
  worked: number,
  assigned: number
): number | null {
  return calculatePercentage(worked, assigned, 1);
}

/**
 * Calculate % Orders Worked of Orders Loaded
 * Returns percentage rounded to 1 decimal place
 */
export function calcWorkedOfLoaded(
  worked: number,
  loaded: number
): number | null {
  return calculatePercentage(worked, loaded, 1);
}

/**
 * Format percentage for display
 * Returns "N/A" if value is null, otherwise "XX.X%"
 */
export function formatPercentage(value: number | null, decimalPlaces: number = 1): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(decimalPlaces)}%`;
}

/**
 * Format number with comma separators
 * Example: 1234 -> "1,234"
 */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}
