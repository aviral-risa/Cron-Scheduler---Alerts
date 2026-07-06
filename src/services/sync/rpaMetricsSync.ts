/**
 * RPA Metrics Sync Service
 *
 * Orchestrates syncing RPA metrics data from Algolia to Tech Metrics Google Sheet
 */

import { algoliaFetchService } from '../algolia/fetch.service';
import type { AlgoliaOrder } from '../algolia/fetch.service';
import { appendRPARawSnapshots, recordRPASyncLog, updateRPASyncLogStatus } from '../sheets/techMetricsSheets';
import type { RPAOrderSnapshot, RPASyncResponse } from '../../types/rpaMetrics';
import type { SyncLogEntry } from '../../types/sync';
import { toISTTimestamp } from '../../utils/timezone';

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Normalize RPA status values from Algolia
 */
function normalizeRPAStatus(status: any): 'not_initiated' | 'success' | 'error' {
  if (!status) return 'not_initiated';

  const lower = String(status).toLowerCase().trim();

  if (lower === 'success' || lower === 'completed') return 'success';
  if (lower === 'error' || lower.includes('error') || lower.includes('failed')) return 'error';

  return 'not_initiated';
}

/**
 * Transform Algolia order to RPA snapshot
 */
function transformAlgoliaToRPASnapshot(algoliaOrder: AlgoliaOrder, syncTimestamp: string): RPAOrderSnapshot {
  return {
    snapshot_timestamp: syncTimestamp,
    order_id: algoliaOrder.objectID || algoliaOrder.id || algoliaOrder.order_id || '',
    org_id: algoliaOrder.org_id || '',
    created_at: algoliaOrder.created_at_iso || '',
    username: algoliaOrder.assigned_to_name || '',
    master_auth_status: algoliaOrder.master_auth_status || '',
    ev_write_back_status: normalizeRPAStatus(algoliaOrder.ev_write_back_status),
    document_upload_status: normalizeRPAStatus(algoliaOrder.document_upload_status),
    health_first_nar_rpa_status: normalizeRPAStatus(algoliaOrder.health_first_nar_rpa_status),
    date_of_work: algoliaOrder.date_of_work_iso || null,
    assigned_to: algoliaOrder.assigned_to_name || '',
    is_worked: algoliaOrder.master_auth_status !== 'new',
  };
}

// ============================================================================
// SYNC ORCHESTRATION
// ============================================================================

/**
 * Sync RPA metrics for multiple facilities on a specific date
 * This is the main entry point for syncing RPA data
 */
export async function syncRPAMetrics(facilityIds: string[], date: string): Promise<RPASyncResponse> {
  console.log(`[RPA Sync] Starting RPA metrics sync for ${facilityIds.join(', ')} on ${date}`);

  const syncTimestamp = toISTTimestamp(new Date());
  const facilitiesProcessed: string[] = [];
  let totalRecordsSynced = 0;
  const errors: string[] = [];

  for (const facilityId of facilityIds) {
    try {
      console.log(`[RPA Sync] Processing facility: ${facilityId}`);

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
      await recordRPASyncLog(syncLogEntry);

      // Fetch orders from Algolia (30-day window to capture orders worked on target date)
      // Note: Algolia filters by created_at, but we need date_of_work, so we fetch a wide range
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 30); // 30 days before target date
      const startDateStr = startDate.toISOString().split('T')[0];

      console.log(`[RPA Sync] Fetching orders for ${facilityId} from ${startDateStr} to ${date} (30-day window)`);
      const algoliaOrders = await algoliaFetchService.fetchOrdersByDateRange(facilityId, startDateStr, date);

      if (algoliaOrders.length === 0) {
        console.warn(`[RPA Sync] No orders found for ${facilityId} in date range`);
        await updateRPASyncLogStatus(facilityId, date, 'completed', 'No orders found', 0);
        facilitiesProcessed.push(facilityId);
        continue;
      }

      console.log(`[RPA Sync] Fetched ${algoliaOrders.length} orders from Algolia`);

      // Transform to RPA snapshots
      const rpaSnapshots = algoliaOrders.map((order) => transformAlgoliaToRPASnapshot(order, syncTimestamp));

      // Filter: Only include worked orders (is_worked = true)
      const workedSnapshots = rpaSnapshots.filter((snapshot) => snapshot.is_worked);

      // Filter: Only orders worked on the target date
      const targetDateStr = date; // YYYY-MM-DD format
      const workedOnTargetDate = workedSnapshots.filter((snapshot) => {
        if (!snapshot.date_of_work) return false;
        const workDateStr = snapshot.date_of_work.split('T')[0]; // Extract YYYY-MM-DD
        return workDateStr === targetDateStr;
      });

      console.log(`[RPA Sync] ${workedOnTargetDate.length} orders worked on ${date} (from ${workedSnapshots.length} worked orders)`);

      // Filter out incomplete snapshots (orders missing critical fields)
      const validSnapshots = workedOnTargetDate.filter(
        (snapshot) => snapshot.order_id && snapshot.org_id && snapshot.date_of_work
      );

      if (validSnapshots.length < workedSnapshots.length) {
        console.warn(
          `[RPA Sync] Filtered out ${workedSnapshots.length - validSnapshots.length} incomplete snapshots`
        );
      }

      console.log(`[RPA Sync] ${validSnapshots.length} valid worked orders (from ${algoliaOrders.length} total)`);

      // Write to Google Sheets
      if (validSnapshots.length > 0) {
        console.log(`[RPA Sync] Writing ${validSnapshots.length} snapshots to Google Sheets`);
        await appendRPARawSnapshots(validSnapshots);
      }

      // Update sync log
      await updateRPASyncLogStatus(facilityId, date, 'completed', undefined, validSnapshots.length);

      facilitiesProcessed.push(facilityId);
      totalRecordsSynced += validSnapshots.length;

      console.log(`[RPA Sync] Successfully synced ${validSnapshots.length} records for ${facilityId}`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`[RPA Sync] Failed to sync ${facilityId}:`, errorMessage);
      errors.push(`${facilityId}: ${errorMessage}`);

      // Update sync log with failure
      try {
        await updateRPASyncLogStatus(facilityId, date, 'failed', errorMessage, 0);
      } catch (logError) {
        console.error(`[RPA Sync] Failed to update sync log for ${facilityId}:`, logError);
      }
    }
  }

  // Summary
  const success = errors.length === 0;
  const finalMessage = success
    ? `Successfully synced ${totalRecordsSynced} records for ${facilitiesProcessed.length} facilities`
    : `Completed with ${errors.length} errors`;

  console.log(`[RPA Sync] ${finalMessage}`);

  return {
    success,
    recordsSynced: totalRecordsSynced,
    facilitiesProcessed,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    timestamp: syncTimestamp,
  };
}

/**
 * Sync RPA metrics for a single facility on a specific date
 * Convenience function for syncing one facility at a time
 */
export async function syncRPAMetricsForFacility(facilityId: string, date: string): Promise<RPASyncResponse> {
  return syncRPAMetrics([facilityId], date);
}

/**
 * Sync RPA metrics for all facilities on a specific date
 * Uses predefined list of facility IDs from environment or config
 */
export async function syncRPAMetricsForAllFacilities(date: string): Promise<RPASyncResponse> {
  // Facility IDs from your system: NYCBS, MBPCC, CHC, CHCU, UCBC, CBC
  const allFacilityIds = ['NYCBS', 'MBPCC', 'CHC', 'CHCU', 'UCBC', 'CBC'];

  return syncRPAMetrics(allFacilityIds, date);
}

/**
 * Sync RPA metrics for today (current IST date)
 */
export async function syncRPAMetricsForToday(facilityIds: string[]): Promise<RPASyncResponse> {
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

  console.log(`[RPA Sync] Syncing RPA metrics for today (IST): ${dateIST}`);

  return syncRPAMetrics(facilityIds, dateIST);
}
