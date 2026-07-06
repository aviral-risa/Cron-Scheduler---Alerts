/**
 * Business Data Hook
 * Manages data fetching and state for the Business View
 */

import { useState, useEffect, useCallback } from 'react';
import type { BusinessMetrics, OrgBusinessMetrics, DailyBusinessMetrics, BusinessViewFilters } from '../types/business';
import { fetchAllBusinessMetrics } from '../services/businessApi';

interface BusinessDataState {
  summary: BusinessMetrics | null;
  dailyBreakdown: DailyBusinessMetrics[];
  orgBreakdown: OrgBusinessMetrics[];
  loading: boolean;
  error: string | null;
}

interface UseBusinessDataReturn extends BusinessDataState {
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage business view data
 */
export function useBusinessData(filters: BusinessViewFilters): UseBusinessDataReturn {
  const [state, setState] = useState<BusinessDataState>({
    summary: null,
    dailyBreakdown: [],
    orgBreakdown: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch all data in ONE optimized call (avoids Google Sheets rate limits)
      const { summary, dailyBreakdown, orgBreakdown } = await fetchAllBusinessMetrics(
        filters.organizationIds,
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        filters.includeWeekends
      );

      setState({
        summary,
        dailyBreakdown,
        orgBreakdown,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching business data:', error);
      setState({
        summary: null,
        dailyBreakdown: [],
        orgBreakdown: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch business data',
      });
    }
  }, [
    filters.organizationIds,
    filters.dateRange.startDate,
    filters.dateRange.endDate,
    filters.includeWeekends,
  ]);

  // Fetch data when filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refetch: fetchData,
  };
}
