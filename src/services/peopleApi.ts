/**
 * People View API Service
 * Client-side API calls for person performance data
 */

import type { PersonPerformanceSummary, DailyPersonPerformance } from '../types/people';
import { authGet } from './api/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export async function fetchPersonPerformance(
  personId: string,
  startDate: string,
  endDate: string,
  includeWeekends: boolean
): Promise<{
  summary: PersonPerformanceSummary;
  dailyBreakdown: DailyPersonPerformance[];
}> {
  const params = new URLSearchParams({
    personId,
    startDate,
    endDate,
    includeWeekends: includeWeekends.toString(),
  });

  const response = await authGet(
    `${API_BASE_URL}/api/people-metrics/person-performance?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch person performance data');
  }

  return response.json();
}
