/**
 * useEVMetricsData Hook
 *
 * Custom hook for fetching and managing EV metrics data
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  EVMetricsFilters,
  EVDailySummary,
  EVTrendDataPoint,
  EVPayerBreakdown,
  EVAggregatedSummary,
} from '../types/evMetrics';
import {
  fetchEVMetricsSummary,
  fetchEVMetricsTrend,
  fetchEVPayerBreakdown,
  triggerEVMetricsSync,
  refreshEVMetricsFromSheets,
} from '../services/api/evMetricsApi';
import { aggregateEVSummaries, aggregatePayerBreakdownsByPayer } from '../utils/metrics/evMetrics';

interface UseEVMetricsDataReturn {
  summary: EVDailySummary[];
  aggregatedSummary: EVAggregatedSummary | null;
  trendData: EVTrendDataPoint[];
  payerBreakdown: EVPayerBreakdown[];
  loading: boolean;
  error: string | null;
  refreshFromSheets: () => Promise<void>;
  triggerFreshSync: (facilityIds: string[], date: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useEVMetricsData(filters: EVMetricsFilters): UseEVMetricsDataReturn {
  const [summary, setSummary] = useState<EVDailySummary[]>([]);
  const [aggregatedSummary, setAggregatedSummary] = useState<EVAggregatedSummary | null>(null);
  const [trendData, setTrendData] = useState<EVTrendDataPoint[]>([]);
  const [payerBreakdown, setPayerBreakdown] = useState<EVPayerBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all EV metrics data
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [summaryData, trendDataResponse, payerBreakdownData] = await Promise.all([
        fetchEVMetricsSummary(filters),
        fetchEVMetricsTrend(filters),
        fetchEVPayerBreakdown(filters),
      ]);

      setSummary(summaryData);
      setTrendData(trendDataResponse);

      // Aggregate payer breakdown across all dates
      const aggregatedPayerData = aggregatePayerBreakdownsByPayer(payerBreakdownData);
      setPayerBreakdown(aggregatedPayerData);

      // Calculate aggregated summary for overview cards
      if (summaryData.length > 0) {
        const aggregated = aggregateEVSummaries(summaryData);
        setAggregatedSummary(aggregated);
      } else {
        setAggregatedSummary(null);
      }
    } catch (err) {
      console.error('Error fetching EV metrics data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch EV metrics data');
      setSummary([]);
      setTrendData([]);
      setPayerBreakdown([]);
      setAggregatedSummary(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Refresh data from Google Sheets only (no Algolia sync)
   */
  const refreshFromSheets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary from sheets, then recalculate everything
      const summaryData = await refreshEVMetricsFromSheets(filters);

      // Fetch trend and payer breakdown in parallel
      const [trendDataResponse, payerBreakdownData] = await Promise.all([
        fetchEVMetricsTrend(filters),
        fetchEVPayerBreakdown(filters),
      ]);

      setSummary(summaryData);
      setTrendData(trendDataResponse);

      // Aggregate payer breakdown across all dates
      const aggregatedPayerData = aggregatePayerBreakdownsByPayer(payerBreakdownData);
      setPayerBreakdown(aggregatedPayerData);

      if (summaryData.length > 0) {
        const aggregated = aggregateEVSummaries(summaryData);
        setAggregatedSummary(aggregated);
      } else {
        setAggregatedSummary(null);
      }
    } catch (err) {
      console.error('Error refreshing EV metrics from sheets:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh EV metrics from sheets');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Trigger fresh sync from Algolia, then reload data
   */
  const triggerFreshSync = useCallback(
    async (facilityIds: string[], date: string) => {
      try {
        setLoading(true);
        setError(null);

        console.log(`[useEVMetricsData] Triggering fresh sync for ${facilityIds.join(', ')} on ${date}`);

        // Trigger sync
        const syncResult = await triggerEVMetricsSync(facilityIds, date);

        if (!syncResult.success) {
          throw new Error(syncResult.error || 'Sync failed');
        }

        console.log(`[useEVMetricsData] Sync completed: ${syncResult.recordsSynced} records synced`);

        // After sync, reload data
        await fetchData();
      } catch (err) {
        console.error('Error triggering fresh sync:', err);
        setError(err instanceof Error ? err.message : 'Failed to trigger fresh sync');
      } finally {
        setLoading(false);
      }
    },
    [fetchData]
  );

  /**
   * Refetch data (alias for fetchData)
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Fetch data on mount and when filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    aggregatedSummary,
    trendData,
    payerBreakdown,
    loading,
    error,
    refreshFromSheets,
    triggerFreshSync,
    refetch,
  };
}
