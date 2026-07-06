/**
 * useRPAMetricsData Hook
 *
 * Custom hook for fetching and managing RPA metrics data
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  RPAMetricsFilters,
  RPADailySummary,
  RPATrendDataPoint,
  RPAUserBreakdown,
  RPAHourlyDataPoint,
  RPAAggregatedSummary,
} from '../types/rpaMetrics';
import {
  fetchRPAMetricsSummary,
  fetchRPAMetricsTrend,
  fetchRPAUserBreakdown,
  fetchRPAHourlyMetrics,
  triggerRPAMetricsSync,
} from '../services/api/rpaMetricsApi';
import { aggregateRPASummaries } from '../utils/metrics/rpaMetrics';

interface UseRPAMetricsDataReturn {
  summaries: RPADailySummary[];
  aggregatedSummary: RPAAggregatedSummary | null;
  trendData: RPATrendDataPoint[];
  userBreakdown: RPAUserBreakdown[];
  hourlyData: RPAHourlyDataPoint[];
  loading: boolean;
  error: string | null;
  triggerFreshSync: (facilityIds: string[], date: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useRPAMetricsData(filters: RPAMetricsFilters): UseRPAMetricsDataReturn {
  const [summaries, setSummaries] = useState<RPADailySummary[]>([]);
  const [aggregatedSummary, setAggregatedSummary] = useState<RPAAggregatedSummary | null>(null);
  const [trendData, setTrendData] = useState<RPATrendDataPoint[]>([]);
  const [userBreakdown, setUserBreakdown] = useState<RPAUserBreakdown[]>([]);
  const [hourlyData, setHourlyData] = useState<RPAHourlyDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all RPA metrics data
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary, trend, and user breakdown in parallel
      const [summaryData, trendDataResponse, userBreakdownData] = await Promise.all([
        fetchRPAMetricsSummary(filters),
        fetchRPAMetricsTrend(filters),
        fetchRPAUserBreakdown(filters),
      ]);

      setSummaries(summaryData);
      setTrendData(trendDataResponse);
      setUserBreakdown(userBreakdownData);

      // Calculate aggregated summary for overview cards
      if (summaryData.length > 0) {
        const aggregated = aggregateRPASummaries(summaryData);
        setAggregatedSummary(aggregated);
      } else {
        setAggregatedSummary(null);
      }

      // Fetch hourly data for the first date in the range (for spike detection)
      try {
        const hourlyDataResponse = await fetchRPAHourlyMetrics({
          organizationIds: filters.organizationIds,
          date: filters.dateRange.startDate,
        });
        setHourlyData(hourlyDataResponse);
      } catch (hourlyError) {
        console.warn('Could not fetch hourly data:', hourlyError);
        setHourlyData([]);
      }
    } catch (err) {
      console.error('Error fetching RPA metrics data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch RPA metrics data');
      setSummaries([]);
      setTrendData([]);
      setUserBreakdown([]);
      setHourlyData([]);
      setAggregatedSummary(null);
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

        console.log(`[useRPAMetricsData] Triggering fresh sync for ${facilityIds.join(', ')} on ${date}`);

        // Trigger sync
        const syncResult = await triggerRPAMetricsSync(facilityIds, date);

        if (!syncResult.success) {
          throw new Error(syncResult.error || 'Sync failed');
        }

        console.log(`[useRPAMetricsData] Sync completed: ${syncResult.recordsSynced} records synced`);

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
    summaries,
    aggregatedSummary,
    trendData,
    userBreakdown,
    hourlyData,
    loading,
    error,
    triggerFreshSync,
    refetch,
  };
}
