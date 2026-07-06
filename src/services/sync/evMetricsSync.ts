/**
 * EV Metrics Sync Service
 *
 * @deprecated This module is deprecated. EV metrics are now calculated from
 * unique_orders_status within the main syncOrgData() pipeline and stored in
 * the pre-aggregated ev_metrics_daily sheet. See src/services/sync.ts
 * (calculateEVMetricsDaily) and src/services/sheets/techMetricsSheets.ts
 * (appendOrUpdateEVMetricsDaily) for the new pipeline.
 *
 * Kept for reference only.
 */

import { algoliaFetchService } from '../algolia/fetch.service';
import type { AlgoliaOrder } from '../algolia/fetch.service';
import { appendEVRawSnapshots, recordEVSyncLog, updateEVSyncLogStatus } from '../sheets/techMetricsSheets';
import type { EVOrderSnapshot, EVSyncResponse } from '../../types/evMetrics';
import type { SyncLogEntry } from '../../types/sync';
import { toISTTimestamp } from '../../utils/timezone';
import { ORGANIZATIONS } from '../../config/organizations';

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform Algolia order to EV order snapshot
 * Extracts EV-specific fields from Algolia data
 */
function transformAlgoliaToEVSnapshot(algoliaOrder: AlgoliaOrder, syncTimestamp: string): EVOrderSnapshot {
  const now = new Date(syncTimestamp);
  const snapshotHourIST = new Date(syncTimestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  });

  return {
    snapshot_timestamp: syncTimestamp,
    snapshot_hour_ist: snapshotHourIST,
    snapshot_date: syncTimestamp.split(' ')[0], // Extract date part (YYYY-MM-DD)
    order_id: algoliaOrder.objectID || algoliaOrder.id || algoliaOrder.order_id || '',
    facility_id: algoliaOrder.org_id || '',
    created_at_date: extractDateFromISO(algoliaOrder.created_at_iso),

    // EV-specific fields from Algolia
    primary_active: normalizeActiveStatus(algoliaOrder.primary_active),
    primary_payer_name: algoliaOrder.primary_payer_name || null,
    ev_bv_primary: algoliaOrder.ev_bv_primary || null,
  };
}

/**
 * Extract date (YYYY-MM-DD) from ISO timestamp
 */
function extractDateFromISO(isoString: string | null | undefined): string {
  if (!isoString) return '';

  try {
    // ISO string format: "2026-01-13T10:15:32.000Z"
    // Extract date part
    return isoString.split('T')[0];
  } catch (error) {
    console.error(`[EV Sync] Failed to parse date from: ${isoString}`, error);
    return '';
  }
}

/**
 * Normalize primary_active status
 */
function normalizeActiveStatus(status: any): 'active' | 'inactive' | 'unknown' | null {
  if (!status) return null;

  const lower = String(status).toLowerCase().trim();

  if (lower === 'active' || lower === 'active coverage') return 'active';
  if (lower === 'inactive' || lower === 'inactive coverage') return 'inactive';
  if (lower === 'coverage unknown' || lower === 'unknown' || lower === '-') return 'unknown';

  // Default to unknown for unrecognized values
  return 'unknown';
}

// ============================================================================
// SYNC ORCHESTRATION
// ============================================================================

/**
 * @deprecated Use calculateEVMetricsDaily() from sync.ts instead.
 * Sync EV metrics for multiple facilities on a specific date
 */
export async function syncEVMetrics(facilityIds: string[], date: string): Promise<EVSyncResponse> {
  console.log(`[EV Sync] Starting EV metrics sync for ${facilityIds.join(', ')} on ${date}`);

  const syncTimestamp = toISTTimestamp(new Date());
  const facilitiesProcessed: string[] = [];
  let totalRecordsSynced = 0;
  const errors: string[] = [];

  for (const facilityId of facilityIds) {
    try {
      console.log(`[EV Sync] Processing facility: ${facilityId}`);

      // Record sync start in log
      const syncLogEntry: SyncLogEntry = {
        facility_id: facilityId,
        date,
        sync_start_timestamp: syncTimestamp,
        sync_end_timestamp: null,
        status: 'in_progress',
        error_message: null,
        records_synced: null,
      };
      await recordEVSyncLog(syncLogEntry);

      // Fetch orders from Algolia
      console.log(`[EV Sync] Fetching orders from Algolia for ${facilityId} on ${date}`);
      const algoliaOrders = await algoliaFetchService.fetchOrdersByDate(facilityId, date);

      if (algoliaOrders.length === 0) {
        console.warn(`[EV Sync] No orders found for ${facilityId} on ${date}`);
        await updateEVSyncLogStatus(facilityId, date, 'completed', 'No orders found', 0);
        facilitiesProcessed.push(facilityId);
        continue;
      }

      // Transform to EV snapshots
      console.log(`[EV Sync] Transforming ${algoliaOrders.length} orders to EV snapshots`);
      const evSnapshots = algoliaOrders.map((order) => transformAlgoliaToEVSnapshot(order, syncTimestamp));

      // Filter out incomplete snapshots (orders missing critical fields)
      const validSnapshots = evSnapshots.filter(
        (snapshot) => snapshot.order_id && snapshot.facility_id && snapshot.created_at_date
      );

      if (validSnapshots.length < evSnapshots.length) {
        console.warn(
          `[EV Sync] Filtered out ${evSnapshots.length - validSnapshots.length} incomplete snapshots`
        );
      }

      // Write to Google Sheets
      console.log(`[EV Sync] Writing ${validSnapshots.length} snapshots to Google Sheets`);
      await appendEVRawSnapshots(validSnapshots);

      // Update sync log
      await updateEVSyncLogStatus(facilityId, date, 'completed', undefined, validSnapshots.length);

      facilitiesProcessed.push(facilityId);
      totalRecordsSynced += validSnapshots.length;

      console.log(`[EV Sync] Successfully synced ${validSnapshots.length} records for ${facilityId}`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`[EV Sync] Failed to sync ${facilityId}:`, errorMessage);
      errors.push(`${facilityId}: ${errorMessage}`);

      // Update sync log with failure
      try {
        await updateEVSyncLogStatus(facilityId, date, 'failed', errorMessage, 0);
      } catch (logError) {
        console.error(`[EV Sync] Failed to update sync log for ${facilityId}:`, logError);
      }
    }
  }

  // Summary
  const success = errors.length === 0;
  const finalMessage = success
    ? `Successfully synced ${totalRecordsSynced} records for ${facilitiesProcessed.length} facilities`
    : `Completed with ${errors.length} errors`;

  console.log(`[EV Sync] ${finalMessage}`);

  return {
    success,
    recordsSynced: totalRecordsSynced,
    facilitiesProcessed,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    timestamp: syncTimestamp,
  };
}

/**
 * @deprecated Use calculateEVMetricsDaily() from sync.ts instead.
 * Sync EV metrics for a single facility on a specific date
 */
export async function syncEVMetricsForFacility(facilityId: string, date: string): Promise<EVSyncResponse> {
  return syncEVMetrics([facilityId], date);
}

/**
 * @deprecated EV metrics are now calculated within the main sync pipeline.
 * Sync EV metrics for all facilities on a specific date
 */
export async function syncEVMetricsForAllFacilities(date: string): Promise<EVSyncResponse> {
  const allFacilityIds = ORGANIZATIONS.map(org => org.facilityId);
  return syncEVMetrics(allFacilityIds, date);
}

/**
 * @deprecated EV metrics are now calculated within the main sync pipeline.
 * Sync EV metrics for today (current IST date)
 */
export async function syncEVMetricsForToday(facilityIds: string[]): Promise<EVSyncResponse> {
  // Get current date in IST
  const today = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Convert to YYYY-MM-DD format
  const [month, day, year] = today.split('/');
  const dateIST = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  console.log(`[EV Sync] Syncing EV metrics for today (IST): ${dateIST}`);

  return syncEVMetrics(facilityIds, dateIST);
}
