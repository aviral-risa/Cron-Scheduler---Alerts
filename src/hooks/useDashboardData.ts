/**
 * Custom hook for fetching dashboard data from Google Sheets
 * Handles loading states, errors, and data refresh
 */

import { useState, useEffect, useCallback } from 'react';
import type { OrgMetrics, PersonMetrics } from '../types/orders';
import {
  fetchLatestOrgMetrics,
  fetchHourlyOrgMetrics,
  fetchLatestPersonMetrics,
} from '../services/dashboardApi';

interface DashboardData {
  latestMetrics: OrgMetrics | null;
  hourlyMetrics: OrgMetrics[];
  personMetrics: PersonMetrics[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refetch: () => void;
}

/**
 * Fetch and manage dashboard data for a specific facility and date
 * @param facilityId - The facility ID to fetch data for
 * @param date - The date in YYYY-MM-DD format
 */
export function useDashboardData(facilityId: string, date: string): DashboardData {
  const [data, setData] = useState<Omit<DashboardData, 'refetch'>>({
    latestMetrics: null,
    hourlyMetrics: [],
    personMetrics: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const fetchData = useCallback(async () => {
    if (!facilityId || !date) {
      setData({
        latestMetrics: null,
        hourlyMetrics: [],
        personMetrics: [],
        loading: false,
        error: 'Invalid facility ID or date',
        lastUpdated: null,
      });
      return;
    }

    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch all 3 data sources in parallel
      const [latest, hourly, person] = await Promise.all([
        fetchLatestOrgMetrics(facilityId, date),
        fetchHourlyOrgMetrics(facilityId, date),
        fetchLatestPersonMetrics(facilityId, date),
      ]);

      setData({
        latestMetrics: latest,
        hourlyMetrics: hourly,
        personMetrics: person,
        loading: false,
        error: null,
        lastUpdated: latest?.snapshot_timestamp || null,
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setData({
        latestMetrics: null,
        hourlyMetrics: [],
        personMetrics: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch dashboard data',
        lastUpdated: null,
      });
    }
  }, [facilityId, date]);

  // Fetch data on mount and when facilityId or date changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...data, refetch: fetchData };
}
