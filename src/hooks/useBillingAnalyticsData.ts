import { useState, useEffect, useCallback } from 'react';
import type { BillingAnalyticsFilters, BillingDataRow, BillingMetrics, BillingClient } from '../types/billingAnalytics';
import { fetchBillingClients, fetchBillingData } from '../services/api/billingAnalyticsApi';

interface BillingDataState {
  rows: BillingDataRow[];
  metrics: BillingMetrics | null;
  clients: BillingClient[];
  totalRawCount: number;
  dataset: string | null;
  loading: boolean;
  error: string | null;
}

interface UseBillingAnalyticsReturn extends BillingDataState {
  refetch: () => Promise<void>;
}

export function useBillingAnalyticsData(filters: BillingAnalyticsFilters): UseBillingAnalyticsReturn {
  const [state, setState] = useState<BillingDataState>({
    rows: [],
    metrics: null,
    clients: [],
    totalRawCount: 0,
    dataset: null,
    loading: true,
    error: null,
  });

  // Load clients on mount
  useEffect(() => {
    fetchBillingClients()
      .then((clients) => setState((prev) => ({ ...prev, clients })))
      .catch((err) => console.error('Failed to load billing clients:', err));
  }, []);

  const fetchData = useCallback(async () => {
    if (!filters.facilityId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetchBillingData(
        filters.facilityId,
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        filters.dataset
      );

      setState((prev) => ({
        ...prev,
        rows: response.rows,
        metrics: response.metrics,
        totalRawCount: response.totalRawCount,
        dataset: response.dataset,
        loading: false,
        error: null,
      }));
    } catch (error) {
      console.error('Error fetching billing data:', error);
      setState((prev) => ({
        ...prev,
        rows: [],
        metrics: null,
        totalRawCount: 0,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch billing data',
      }));
    }
  }, [filters.facilityId, filters.dateRange.startDate, filters.dateRange.endDate, filters.dataset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}
