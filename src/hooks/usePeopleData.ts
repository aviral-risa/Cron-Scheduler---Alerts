/**
 * People Data Hook
 * Manages data fetching and state for the People View
 */

import { useState, useEffect, useCallback } from 'react';
import type { PersonPerformanceSummary, DailyPersonPerformance, PeopleViewFilters } from '../types/people';
import { fetchPersonPerformance } from '../services/peopleApi';

interface PeopleDataState {
  summary: PersonPerformanceSummary | null;
  dailyBreakdown: DailyPersonPerformance[];
  loading: boolean;
  error: string | null;
}

interface UsePeopleDataReturn extends PeopleDataState {
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage people view data
 */
export function usePeopleData(filters: PeopleViewFilters): UsePeopleDataReturn {
  const [state, setState] = useState<PeopleDataState>({
    summary: null,
    dailyBreakdown: [],
    loading: false,
    error: null,
  });

  const fetchData = useCallback(async () => {
    // Only fetch if personId is selected
    if (!filters.personId) {
      setState({
        summary: null,
        dailyBreakdown: [],
        loading: false,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch all data in ONE optimized call
      const { summary, dailyBreakdown } = await fetchPersonPerformance(
        filters.personId,
        filters.dateRange.startDate,
        filters.dateRange.endDate,
        filters.includeWeekends
      );

      setState({
        summary,
        dailyBreakdown,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching people data:', error);
      setState({
        summary: null,
        dailyBreakdown: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch people data',
      });
    }
  }, [
    filters.personId,
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
