/**
 * Queue Sync Service
 *
 * Orchestrates syncing queue data (person-level queue counts) from Algolia to Google Sheets
 *
 * STORAGE: queue_daily_log (dedicated QUEUE spreadsheet)
 * - Runs once at 11:59 PM IST daily
 * - Stores ALL daily snapshots permanently for historical analysis
 * - No retention/deletion - permanent storage
 */

import { fetchMultiplePersonQueueCounts } from '../algolia/queue.service';
import { appendQueueDailyLog } from '../sheets-dual';
import type { PersonQueueSnapshot } from '../../types/queue';
import { toISTTimestamp, toISTDate, toISTHour } from '../../utils/timezone';

export interface QueueSyncResponse {
  success: boolean;
  recordsSynced: number;
  facilitiesProcessed: string[];
  error?: string;
  timestamp: string;
}

/**
 * Sync queue data for specific facilities
 * Fetches queue counts for all team members and stores to Google Sheets
 */
export async function syncQueueData(
  facilityIds: string[],
  teamMembers: Array<{ name: string; id: string; facilityId: string }>
): Promise<QueueSyncResponse> {
  console.log(`[Queue Sync] Starting queue data sync for ${facilityIds.join(', ')}`);

  const syncTimestamp = toISTTimestamp(new Date());
  const facilitiesProcessed: string[] = [];
  let totalRecordsSynced = 0;
  const errors: string[] = [];

  // Group team members by facility
  const membersByFacility = teamMembers.reduce(
    (acc, member) => {
      if (!acc[member.facilityId]) {
        acc[member.facilityId] = [];
      }
      acc[member.facilityId].push({ name: member.name, id: member.id });
      return acc;
    },
    {} as Record<string, Array<{ name: string; id: string }>>
  );

  for (const facilityId of facilityIds) {
    try {
      const members = membersByFacility[facilityId];
      if (!members || members.length === 0) {
        console.warn(`[Queue Sync] No team members found for facility ${facilityId}`);
        continue;
      }

      console.log(`[Queue Sync] Fetching queue data for ${members.length} members in ${facilityId}`);

      // Fetch queue counts from Algolia
      const queueData = await fetchMultiplePersonQueueCounts(facilityId, members);

      // Get date and hour components for the snapshot
      const now = new Date();
      const snapshotDate = toISTDate(now);
      const snapshotHour = String(toISTHour(now)).padStart(2, '0');

      // Transform to queue snapshots
      const snapshots: PersonQueueSnapshot[] = queueData.map((data) => ({
        snapshot_timestamp: syncTimestamp,
        snapshot_date: snapshotDate,
        snapshot_hour: snapshotHour,
        person_name: data.personName,
        person_id: data.personId,
        facility_id: data.facilityId,
        new: data.new,
        pending: data.pending,
        query: data.query,
        hold: data.hold,
        auth_required: data.authRequired,
        total_open_orders: data.totalOpenOrders,
      }));

      // Write to QUEUE spreadsheet (queue_daily_log)
      console.log(`[Queue Sync] Writing ${snapshots.length} snapshots to queue_daily_log`);
      await appendQueueDailyLog(snapshots);

      facilitiesProcessed.push(facilityId);
      totalRecordsSynced += snapshots.length;

      console.log(`[Queue Sync] Successfully synced ${snapshots.length} records for ${facilityId}`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`[Queue Sync] Failed to sync ${facilityId}:`, errorMessage);
      errors.push(`${facilityId}: ${errorMessage}`);
    }
  }

  // Summary
  const success = errors.length === 0;
  const finalMessage = success
    ? `Successfully synced ${totalRecordsSynced} queue records for ${facilitiesProcessed.length} facilities`
    : `Completed with ${errors.length} errors`;

  console.log(`[Queue Sync] ${finalMessage}`);

  return {
    success,
    recordsSynced: totalRecordsSynced,
    facilitiesProcessed,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    timestamp: syncTimestamp,
  };
}

/**
 * Sync queue data for all facilities using the API server
 * This function triggers the API server to fetch and store queue data
 */
export async function syncQueueDataForAllFacilities(): Promise<QueueSyncResponse> {
  console.log('[Queue Sync] Triggering queue data sync via API server...');

  try {
    // The API server at /api/queue/latest already handles fetching queue data
    // We need to trigger it to refresh and store the latest snapshots
    // For now, we'll call the API endpoint that fetches from Algolia

    // Use the backend API which has the people configuration
    const response = await fetch('http://localhost:3001/api/queue/refresh', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log('[Queue Sync] Successfully synced queue data via API');
    console.log(`[Queue Sync] Records synced: ${result.recordsSynced || 'N/A'}`);

    return {
      success: true,
      recordsSynced: result.recordsSynced || 0,
      facilitiesProcessed: result.facilitiesProcessed || [],
      timestamp: toISTTimestamp(new Date()),
    };
  } catch (error: any) {
    console.error('[Queue Sync] Error syncing queue data:', error.message);

    // Note: The API server is responsible for fetching and storing queue data
    // If the endpoint doesn't exist yet, you can manually trigger it via the dashboard
    console.warn('[Queue Sync] Note: Queue sync requires the API server to be running');
    console.warn('[Queue Sync] Alternative: Use the dashboard Queue View to manually refresh data');

    return {
      success: false,
      recordsSynced: 0,
      facilitiesProcessed: [],
      error: error.message,
      timestamp: toISTTimestamp(new Date()),
    };
  }
}
