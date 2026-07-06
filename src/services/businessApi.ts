/**
 * Business View API Client
 * Functions for fetching business metrics from the backend API
 */

import type { BusinessMetrics, OrgBusinessMetrics, DailyBusinessMetrics } from '../types/business';
import type { WorkingDayConfig } from '../types/orders';
import { authGet } from './api/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Fetch ALL business metrics in one optimized call (avoids rate limits)
 */
export async function fetchAllBusinessMetrics(
  facilityIds: string[],
  startDate: string,
  endDate: string,
  includeWeekends: boolean
): Promise<{
  summary: BusinessMetrics;
  dailyBreakdown: DailyBusinessMetrics[];
  orgBreakdown: OrgBusinessMetrics[];
}> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    includeWeekends: includeWeekends.toString(),
  });

  // Add facility IDs as comma-separated string
  if (facilityIds.length > 0) {
    params.append('facilityIds', facilityIds.join(','));
  }

  const response = await authGet(`${API_BASE_URL}/api/business-metrics/all?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch business metrics');
  }

  return response.json();
}

/**
 * Fetch business metrics summary for date range and organizations
 */
export async function fetchBusinessSummary(
  facilityIds: string[],
  startDate: string,
  endDate: string,
  includeWeekends: boolean
): Promise<BusinessMetrics> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    includeWeekends: includeWeekends.toString(),
  });

  // Add facility IDs as comma-separated string
  if (facilityIds.length > 0) {
    params.append('facilityIds', facilityIds.join(','));
  }

  const response = await authGet(`${API_BASE_URL}/api/business-metrics/summary?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch business summary');
  }

  return response.json();
}

/**
 * Fetch daily breakdown of business metrics
 */
export async function fetchDailyBreakdown(
  facilityIds: string[],
  startDate: string,
  endDate: string,
  includeWeekends: boolean
): Promise<DailyBusinessMetrics[]> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    includeWeekends: includeWeekends.toString(),
  });

  if (facilityIds.length > 0) {
    params.append('facilityIds', facilityIds.join(','));
  }

  const response = await authGet(`${API_BASE_URL}/api/business-metrics/daily-breakdown?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch daily breakdown');
  }

  return response.json();
}

/**
 * Fetch organization breakdown of business metrics
 */
export async function fetchOrgBreakdown(
  facilityIds: string[],
  startDate: string,
  endDate: string,
  includeWeekends: boolean
): Promise<OrgBusinessMetrics[]> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    includeWeekends: includeWeekends.toString(),
  });

  if (facilityIds.length > 0) {
    params.append('facilityIds', facilityIds.join(','));
  }

  const response = await authGet(`${API_BASE_URL}/api/business-metrics/org-breakdown?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch org breakdown');
  }

  return response.json();
}

/**
 * Fetch working days configuration for a date range
 */
export async function fetchWorkingDays(
  startDate: string,
  endDate: string
): Promise<WorkingDayConfig[]> {
  const params = new URLSearchParams({ startDate, endDate });

  const response = await authGet(`${API_BASE_URL}/api/working-days/range?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch working days');
  }

  return response.json();
}
