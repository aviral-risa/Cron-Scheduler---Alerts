/**
 * useAgentModeMetricsData Hook
 *
 * Custom hook for fetching and managing Agent Mode metrics data
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  AgentModeMetricsFilters,
  AgentModeMetricsData,
  AgentModeOverview,
  NARAgentReviewAnalysis,
  NAROrdersByPlan,
  AllOrdersDailyTrend,
  NARAgentDailyTrend,
  NARAgentL7DAverage,
  NARAgentReviewDaily,
  NARAgentReviewL7DAverage,
} from '../types/agentModeMetrics';
import { fetchAgentModeMetrics } from '../services/api/agentModeMetricsApi';
import { calculateOrderStatusL7DAverage, calculateReviewL7DAverage } from '../utils/metrics/agentModeL7D';

interface UseAgentModeMetricsDataReturn {
  data: AgentModeMetricsData | null;
  overview: AgentModeOverview | null;
  narAgentReview: NARAgentReviewAnalysis | null;
  narOrdersByPlan: NAROrdersByPlan[];
  allOrdersDailyTrend: AllOrdersDailyTrend[];             // NEW: All orders daily trend
  narDailyTrend: NARAgentDailyTrend[];                    // NEW
  narL7DAverage: NARAgentL7DAverage | null;               // NEW
  narReviewDaily: NARAgentReviewDaily[];                  // NEW
  narReviewL7DAverage: NARAgentReviewL7DAverage | null;   // NEW
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAgentModeMetricsData(
  filters: AgentModeMetricsFilters
): UseAgentModeMetricsDataReturn {
  const [data, setData] = useState<AgentModeMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch Agent Mode metrics data
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[useAgentModeMetricsData] Fetching data with filters:', filters);

      const metricsData = await fetchAgentModeMetrics(filters);

      console.log('[useAgentModeMetricsData] Received data:', {
        totalOrders: metricsData.overview.totalOrders,
        narPlans: metricsData.narOrdersByPlan.length,
      });

      setData(metricsData);
    } catch (err) {
      console.error('[useAgentModeMetricsData] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch agent mode metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Refetch data
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Fetch data on mount and when filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate L7D averages
  const narL7DAverage = useMemo(() => {
    if (data?.narDailyTrend && data.narDailyTrend.length > 0) {
      return calculateOrderStatusL7DAverage(data.narDailyTrend);
    }
    return null;
  }, [data?.narDailyTrend]);

  const narReviewL7DAverage = useMemo(() => {
    if (data?.narReviewDaily && data.narReviewDaily.length > 0) {
      return calculateReviewL7DAverage(data.narReviewDaily);
    }
    return null;
  }, [data?.narReviewDaily]);

  return {
    data,
    overview: data?.overview ?? null,
    narAgentReview: data?.narAgentReview ?? null,
    narOrdersByPlan: data?.narOrdersByPlan ?? [],
    allOrdersDailyTrend: data?.allOrdersDailyTrend ?? [],
    narDailyTrend: data?.narDailyTrend ?? [],
    narL7DAverage,
    narReviewDaily: data?.narReviewDaily ?? [],
    narReviewL7DAverage,
    loading,
    error,
    refetch,
  };
}
