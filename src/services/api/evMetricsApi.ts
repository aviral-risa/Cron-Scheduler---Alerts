/**
 * EV Metrics API Client
 *
 * Frontend service for fetching EV metrics data from the backend API
 */

import type {
  EVMetricsFilters,
  EVDailySummary,
  EVTrendDataPoint,
  EVPayerBreakdown,
  EVSyncResponse,
} from '../../types/evMetrics';
import { authGet, authPost } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Build query string from filters
 */
function buildQueryString(filters: EVMetricsFilters): string {
  const params = new URLSearchParams();

  params.append('startDate', filters.dateRange.startDate);
  params.append('endDate', filters.dateRange.endDate);

  filters.organizationIds.forEach((id) => {
    params.append('organizationIds', id);
  });

  return params.toString();
}

/**
 * Fetch EV metrics summary for date range
 */
export async function fetchEVMetricsSummary(filters: EVMetricsFilters): Promise<EVDailySummary[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/ev-metrics/summary?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch EV metrics trend data for charts
 */
export async function fetchEVMetricsTrend(filters: EVMetricsFilters): Promise<EVTrendDataPoint[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/ev-metrics/trend?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch EV payer breakdown
 */
export async function fetchEVPayerBreakdown(filters: EVMetricsFilters): Promise<EVPayerBreakdown[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/ev-metrics/payer-breakdown?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Trigger EV metrics sync from Algolia
 */
export async function triggerEVMetricsSync(facilityIds: string[], date: string): Promise<EVSyncResponse> {
  const url = `${API_BASE_URL}/api/ev-metrics/sync`;

  const response = await authPost(url, { facilityIds, date });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Refresh EV metrics from Google Sheets (no Algolia fetch)
 */
export async function refreshEVMetricsFromSheets(filters: EVMetricsFilters): Promise<EVDailySummary[]> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/ev-metrics/refresh-from-sheets?${queryString}`;

  const response = await authGet(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}
