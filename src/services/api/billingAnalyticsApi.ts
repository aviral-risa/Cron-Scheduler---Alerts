import { authGet } from './authFetch';
import type { BillingAnalyticsResponse, BillingClient } from '../../types/billingAnalytics';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export async function fetchBillingClients(): Promise<BillingClient[]> {
  const response = await authGet(`${API_BASE_URL}/api/billing-analytics/clients`);
  if (!response.ok) {
    throw new Error('Failed to fetch billing clients');
  }
  return response.json();
}

export async function fetchBillingData(
  facilityId: string,
  startDate: string,
  endDate: string,
  dataset?: string
): Promise<BillingAnalyticsResponse> {
  const params = new URLSearchParams({ facilityId, startDate, endDate });
  if (dataset) params.append('dataset', dataset);

  const response = await authGet(`${API_BASE_URL}/api/billing-analytics/data?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to fetch billing data');
  }
  return response.json();
}
