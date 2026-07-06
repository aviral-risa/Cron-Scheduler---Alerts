/**
 * Browser-side dashboard data fetching
 * Fetches from backend API which reads from Google Sheets
 */

import type { OrgMetrics, PersonMetrics } from '../types/orders';
import type { SyncTriggerResponse, SyncStatusResponse } from '../types/sync';
import { authGet, authPost } from './api/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export async function fetchLatestOrgMetrics(
  facilityId: string,
  date: string
): Promise<OrgMetrics | null> {
  try {
    console.log(`[API] Fetching org metrics from backend for ${facilityId} on ${date}...`);
    const response = await authGet(
      `${API_BASE_URL}/api/org-metrics/latest?facilityId=${facilityId}&date=${date}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] ✓ Received org metrics from Google Sheets`);
    return data;
  } catch (error) {
    console.error('Error fetching latest org metrics:', error);
    throw error;
  }
}

export async function fetchHourlyOrgMetrics(
  facilityId: string,
  date: string
): Promise<OrgMetrics[]> {
  try {
    console.log(`[API] Fetching hourly org metrics from backend for ${facilityId} on ${date}...`);
    const response = await authGet(
      `${API_BASE_URL}/api/org-metrics/hourly?facilityId=${facilityId}&date=${date}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] ✓ Received ${data.length} hourly metrics from Google Sheets`);
    return data;
  } catch (error) {
    console.error('Error fetching hourly org metrics:', error);
    throw error;
  }
}

export async function fetchLatestPersonMetrics(
  facilityId: string,
  date: string
): Promise<PersonMetrics[]> {
  try {
    console.log(`[API] Fetching person metrics from backend for ${facilityId} on ${date}...`);
    const response = await authGet(
      `${API_BASE_URL}/api/person-metrics/latest?facilityId=${facilityId}&date=${date}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] ✓ Received ${data.length} person metrics from Google Sheets`);
    return data;
  } catch (error) {
    console.error('Error fetching person metrics:', error);
    throw error;
  }
}

/**
 * Trigger a fresh sync for a facility and date
 * Calls backend API which triggers Algolia sync
 */
export async function triggerFreshSync(
  facilityId: string,
  date: string
): Promise<SyncTriggerResponse> {
  try {
    console.log(`[API] Triggering Fresh Sync for ${facilityId} on ${date}...`);
    const response = await authPost(`${API_BASE_URL}/api/sync/trigger`, { facilityId, date });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[API] Fresh Sync failed:`, data);
      return {
        success: false,
        message: data.message || 'Failed to trigger sync',
        error: data.error || `HTTP ${response.status}`,
        cooldownUntil: data.cooldownUntil,
      };
    }

    console.log(`[API] ✓ Fresh Sync triggered successfully`);
    return data;
  } catch (error) {
    console.error('Error triggering fresh sync:', error);
    return {
      success: false,
      message: 'Failed to trigger sync',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check sync status for a facility and date
 * Calls backend API to check if sync is in progress or on cooldown
 */
export async function checkSyncStatus(
  facilityId: string,
  date: string
): Promise<SyncStatusResponse> {
  try {
    const response = await authGet(
      `${API_BASE_URL}/api/sync/status?facilityId=${facilityId}&date=${date}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return {
      lastSyncTimestamp: null,
      cooldownRemaining: 0,
      isInProgress: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
