/**
 * Queue View API Client
 * Functions for fetching and storing queue data from the backend API
 */

import type { PersonQueueSnapshot } from '../types/queue';
import { authGet, authPost } from './api/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Fetch latest queue snapshots from Google Sheets
 * @param facilityIds Optional array of facility IDs to filter by
 * @returns Object with snapshots array and lastUpdated timestamp
 */
export async function fetchQueueSnapshotsFromSheets(
  facilityIds?: string[]
): Promise<{ snapshots: PersonQueueSnapshot[]; lastUpdated: string | null }> {
  const params = new URLSearchParams();

  // Add facility IDs as comma-separated string if provided
  if (facilityIds && facilityIds.length > 0) {
    params.append('facilityIds', facilityIds.join(','));
  }

  const url = `${API_BASE_URL}/api/queue/latest${params.toString() ? `?${params}` : ''}`;
  const response = await authGet(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to fetch queue snapshots from sheets');
  }

  const data = await response.json();
  return {
    snapshots: data.snapshots || [],
    lastUpdated: data.lastUpdated || null,
  };
}

/**
 * Refresh queue data by fetching from Algolia via backend API
 * This avoids CORS issues by making the Algolia call from the server
 * @returns Result object with success status and records synced
 */
export async function refreshQueueFromAlgolia(): Promise<{
  success: boolean;
  recordsSynced: number;
  error?: string;
}> {
  const response = await authPost(`${API_BASE_URL}/api/queue/refresh`, {});

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    return {
      success: false,
      recordsSynced: 0,
      error: error.error || error.message || 'Failed to refresh queue data',
    };
  }

  const data = await response.json();
  return {
    success: data.success ?? true,
    recordsSynced: data.recordsSynced || 0,
    error: data.error,
  };
}
