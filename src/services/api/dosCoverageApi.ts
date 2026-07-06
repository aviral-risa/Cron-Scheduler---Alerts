import type {
  DosCoverageFilters,
  DosCoverageData,
  DosCoverageResponse,
} from '../../types/dosCoverage';
import { authGet } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function buildQueryString(filters: DosCoverageFilters): string {
  const params = new URLSearchParams();
  params.append('startDate', filters.dateRange.startDate);
  params.append('endDate', filters.dateRange.endDate);

  if (filters.organizationIds.length > 0) {
    params.append('organizationIds', filters.organizationIds.join(','));
  }

  return params.toString();
}

export async function fetchDosCoverage(
  filters: DosCoverageFilters
): Promise<DosCoverageData> {
  const queryString = buildQueryString(filters);
  const url = `${API_BASE_URL}/api/treatment-aging?${queryString}`;

  console.log('[DoS Coverage API Client] Fetching:', url);

  try {
    const response = await authGet(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new Error(errorMessage);
    }

    const result: DosCoverageResponse = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch DoS coverage data');
    }

    return result.data;
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Cannot connect to server. Please ensure the API server is running on port 3001.');
    }
    throw error;
  }
}
