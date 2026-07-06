/**
 * RPA Metrics API Client
 *
 * Frontend service for fetching RPA metrics data from the backend API
 */

import type {
  RPAMetricsFilters,
  RPADailySummary,
  RPATrendDataPoint,
  RPAUserBreakdown,
  RPAHourlyDataPoint,
  RPASyncResponse,
  RPAHourlyFilters,
} from '../../types/rpaMetrics';
import { authGet, authPost } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Build query string from filters
 */
function buildQueryString(filters: RPAMetricsFilters): string {
  const params = new URLSearchParams();

  params.append('startDate', filters.dateRange.startDate);
  params.append('endDate', filters.dateRange.endDate);

  filters.organizationIds.forEach((id) => {
    params.append('organizationIds', id);
  });

  if (filters.usernames) {
    filters.usernames.forEach((username) => {
      params.append('usernames', username);
    });
  }

  if (filters.rpaStatus) {
    filters.rpaStatus.forEach((status) => {
      params.append('rpaStatus', status);
    });
  }

  return params.toString();
}

/**
 * Build query string for hourly filters
 */
function buildHourlyQueryString(filters: RPAHourlyFilters): string {
  const params = new URLSearchParams();

  params.append('date', filters.date);

  filters.organizationIds.forEach((id) => {
    params.append('organizationIds', id);
  });

  return params.toString();
}

/**
 * Fetch RPA metrics summary for date range
 */
export async function fetchRPAMetricsSummary(filters: RPAMetricsFilters): Promise<RPADailySummary[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/rpa-metrics/summary?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch RPA metrics trend data for charts
 */
export async function fetchRPAMetricsTrend(filters: RPAMetricsFilters): Promise<RPATrendDataPoint[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/rpa-metrics/trend?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch RPA user breakdown
 */
export async function fetchRPAUserBreakdown(filters: RPAMetricsFilters): Promise<RPAUserBreakdown[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/rpa-metrics/user-breakdown?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch RPA hourly metrics (for spike detection)
 */
export async function fetchRPAHourlyMetrics(filters: RPAHourlyFilters): Promise<RPAHourlyDataPoint[]> {
  const queryString = buildHourlyQueryString(filters);
  const url = `${API_BASE_URL}/api/rpa-metrics/hourly?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Trigger RPA metrics sync from Algolia
 */
export async function triggerRPAMetricsSync(facilityIds: string[], date: string): Promise<RPASyncResponse> {
  const url = `${API_BASE_URL}/api/rpa-metrics/sync`;

  const response = await authPost(url, { facilityIds, date });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}
