/**
 * Agent Mode Metrics API Client
 *
 * Frontend service for fetching Agent Mode metrics from the backend API
 */

import type {
  AgentModeMetricsFilters,
  AgentModeMetricsData,
  AgentModeMetricsResponse,
} from '../../types/agentModeMetrics';
import { authGet } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Build query string from filters
 */
function buildQueryString(filters: AgentModeMetricsFilters): string {
  const params = new URLSearchParams();

  params.append('startDate', filters.dateRange.startDate);
  params.append('endDate', filters.dateRange.endDate);

  if (filters.organizationIds.length > 0) {
    params.append('organizationIds', filters.organizationIds.join(','));
  }

  return params.toString();
}

/**
 * Fetch Agent Mode metrics for date range and organizations
 */
export async function fetchAgentModeMetrics(
  filters: AgentModeMetricsFilters
): Promise<AgentModeMetricsData> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/agent-mode-metrics?${queryString}`;

  console.log('[Agent Mode API Client] Fetching:', url);

  try {
    const response = await authGet(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If response is not JSON, use the text
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new Error(errorMessage);
    }

    const result: AgentModeMetricsResponse = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch agent mode metrics');
    }

    return result.data;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Cannot connect to server. Please ensure the API server is running on port 3001.');
    }
    throw error;
  }
}
