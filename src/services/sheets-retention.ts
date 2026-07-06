/**
 * Google Sheets Retention Policy Service
 *
 * Automatically cleans up old data from DASHBOARD spreadsheet to keep it under 40k cells.
 * This prevents the 10M cell limit issue by enforcing data retention rules:
 *
 * DASHBOARD SPREADSHEET (with retention):
 * - org_hourly_metrics: Keep last 30 days
 * - person_hourly_performance: Keep last 30 days
 * - person_level_queues: Keep only latest snapshot per person (legacy, deprecated)
 *
 * NOT CLEANED (permanent storage):
 * - RAW DATA LAKE: append-only audit trail
 * - QUEUE/queue_daily_log: permanent daily queue snapshots (synced at 11:59 PM IST)
 * - UNIQUE_STATUS/unique_orders_status: cumulative order states (archived only when >75% capacity)
 * - UNIQUE_STATUS/business_metrics_daily: daily business metrics
 */

import { google } from 'googleapis';
import { subDays, format } from 'date-fns';
import { DASHBOARD_SHEETS_ID, RAW_DATA_SHEETS_ID } from '../config/data-source.config';
import { getSpreadsheetId, SHEET_NAMES } from './sheets-dual';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  return process.env[key];
};

/**
 * Initialize Google Sheets API client
 */
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Retention policies for DASHBOARD sheets
 *
 * Note: queue_daily_log (in QUEUE spreadsheet) is the primary queue storage.
 * It stores permanent historical daily snapshots - NOT cleaned.
 * person_level_queues is deprecated but kept for backward compatibility.
 */
export const RETENTION_POLICIES = {
  org_hourly_metrics: {
    retentionDays: 30,
    dateColumn: 'created_at_date', // Column C (index 2)
    columnIndex: 2,
    reason: 'Keep 30 days for historical average calculations',
  },
  person_hourly_performance: {
    retentionDays: 30,
    dateColumn: 'created_at_date', // Column C (index 2)
    columnIndex: 2,
    reason: 'Keep 30 days for person pace tracking',
  },
  person_level_queues: {
    mode: 'latest_only' as const,
    personIdColumn: 'person_id', // Column E (index 4)
    timestampColumn: 'snapshot_timestamp', // Column A (index 0)
    reason: 'DEPRECATED - queue_daily_log is now primary storage',
  },
};

/**
 * Delete rows older than retention date from a sheet
 * @param sheetName Name of the sheet to clean
 * @param retentionDays Number of days to keep
 * @param dateColumnIndex Column index containing the date (0-indexed)
 * @returns Number of rows deleted
 */
async function deleteOldRows(
  sheetName: string,
  retentionDays: number,
  dateColumnIndex: number
): Promise<number> {
  const sheets = getSheetsClient();
  const spreadsheetId = DASHBOARD_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error('DASHBOARD_SHEETS_ID not configured');
  }

  // Calculate cutoff date
  const cutoffDate = format(subDays(new Date(), retentionDays), 'yyyy-MM-dd');

  console.log(
    `\n🗑️  Retention cleanup for ${sheetName}: deleting rows older than ${cutoffDate} (${retentionDays} days)`
  );

  // Read all data from sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log(`   No data rows found in ${sheetName}`);
    return 0;
  }

  // Find rows to delete (skip header row)
  const rowsToDelete: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateValue = row[dateColumnIndex] || '';

    // If date is before cutoff, mark for deletion
    if (dateValue < cutoffDate) {
      rowsToDelete.push(i + 1); // +1 for 1-indexed sheets
    }
  }

  if (rowsToDelete.length === 0) {
    console.log(`   ✅ No old rows to delete from ${sheetName}`);
    return 0;
  }

  // Get sheet ID for batch delete
  const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = sheetMetadata.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  if (!sheet || !sheet.properties?.sheetId) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const sheetId = sheet.properties.sheetId;

  // Delete rows in batches (from bottom to top to avoid index shifting)
  const deleteRequests = [];
  rowsToDelete.reverse(); // Delete from bottom first

  for (const rowIndex of rowsToDelete) {
    deleteRequests.push({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1, // 0-indexed for API
          endIndex: rowIndex, // exclusive
        },
      },
    });
  }

  // Execute batch delete (in chunks of 100 to avoid API limits)
  const BATCH_SIZE = 100;
  let totalDeleted = 0;

  for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
    const batch = deleteRequests.slice(i, i + BATCH_SIZE);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: batch,
      },
    });

    totalDeleted += batch.length;
    console.log(
      `   Deleted ${batch.length} rows (${totalDeleted}/${deleteRequests.length})`
    );
  }

  console.log(
    `   ✅ Deleted ${totalDeleted} old rows from ${sheetName} (older than ${cutoffDate})`
  );
  return totalDeleted;
}

/**
 * Keep only latest snapshot per person in person_level_queues
 * @returns Number of rows deleted
 */
async function keepLatestSnapshotsOnly(): Promise<number> {
  const sheets = getSheetsClient();
  const spreadsheetId = DASHBOARD_SHEETS_ID;
  const sheetName = 'person_level_queues';

  if (!spreadsheetId) {
    throw new Error('DASHBOARD_SHEETS_ID not configured');
  }

  console.log(
    `\n🗑️  Retention cleanup for ${sheetName}: keeping only latest snapshot per person`
  );

  // Read all data from sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:L`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log(`   No data rows found in ${sheetName}`);
    return 0;
  }

  // Find latest snapshot per person
  const latestSnapshotByPerson = new Map<string, { rowIndex: number; timestamp: string }>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const personId = row[4] || ''; // Column E (person_id)
    const timestamp = row[0] || ''; // Column A (snapshot_timestamp)

    if (!personId) continue;

    const existing = latestSnapshotByPerson.get(personId);
    if (!existing || timestamp > existing.timestamp) {
      latestSnapshotByPerson.set(personId, { rowIndex: i + 1, timestamp });
    }
  }

  // Find rows to delete (all except latest per person)
  const latestRowIndices = new Set(
    Array.from(latestSnapshotByPerson.values()).map((v) => v.rowIndex)
  );

  const rowsToDelete: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rowIndex = i + 1;
    if (!latestRowIndices.has(rowIndex)) {
      rowsToDelete.push(rowIndex);
    }
  }

  if (rowsToDelete.length === 0) {
    console.log(`   ✅ No old snapshots to delete from ${sheetName}`);
    return 0;
  }

  // Get sheet ID for batch delete
  const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = sheetMetadata.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  if (!sheet || !sheet.properties?.sheetId) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const sheetId = sheet.properties.sheetId;

  // Delete rows in batches (from bottom to top)
  const deleteRequests = [];
  rowsToDelete.reverse();

  for (const rowIndex of rowsToDelete) {
    deleteRequests.push({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    });
  }

  // Execute batch delete (in chunks of 100)
  const BATCH_SIZE = 100;
  let totalDeleted = 0;

  for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
    const batch = deleteRequests.slice(i, i + BATCH_SIZE);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: batch,
      },
    });

    totalDeleted += batch.length;
    console.log(
      `   Deleted ${batch.length} old snapshots (${totalDeleted}/${deleteRequests.length})`
    );
  }

  console.log(
    `   ✅ Deleted ${totalDeleted} old snapshots from ${sheetName} (kept ${latestSnapshotByPerson.size} latest)`
  );
  return totalDeleted;
}

/**
 * Archive unique orders older than 35 days (by created_at_iso)
 * Moves rows from unique_orders_status to unique_orders_archive
 *
 * Uses safe overwrite: appends to archive first, then overwrites main sheet
 * with kept rows, then trims trailing excess rows.
 *
 * @returns Number of rows archived
 */
async function archiveOldUniqueOrders(): Promise<number> {
  const sheets = getSheetsClient();
  const uniqueStatusSpreadsheetId = getSpreadsheetId('unique_status');
  const archiveSpreadsheetId = getSpreadsheetId('archive');

  if (!uniqueStatusSpreadsheetId || !archiveSpreadsheetId) {
    console.log('   ⚠️  Unique status or archive spreadsheet not configured, skipping archival');
    return 0;
  }

  const RETENTION_DAYS = 35;

  console.log(`\n🗃️  Checking unique_orders_status for orders older than ${RETENTION_DAYS} days...`);

  // Calculate cutoff date (today - RETENTION_DAYS) in ISO format
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoffDate.toISOString();

  console.log(`   Retention: ${RETENTION_DAYS} days`);
  console.log(`   Cutoff date: ${cutoffIso.split('T')[0]}`);

  // Read all data from unique_orders_status
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: uniqueStatusSpreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`, // 43 columns
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log(`   No data rows found in unique_orders_status`);
    return 0;
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const currentOrderCount = dataRows.length;

  console.log(`   Current orders: ${currentOrderCount.toLocaleString()}`);

  // Split rows by cutoff date: created_at_iso is column B (index 1)
  const rowsToArchive: string[][] = [];
  const rowsToKeep: string[][] = [];

  for (const row of dataRows) {
    const createdAt = row[1] || '';
    if (createdAt < cutoffIso) {
      rowsToArchive.push(row);
    } else {
      rowsToKeep.push(row);
    }
  }

  if (rowsToArchive.length === 0) {
    console.log(`   ✅ No orders older than ${RETENTION_DAYS} days to archive\n`);
    return 0;
  }

  const oldestDate = rowsToArchive[0][1]?.split('T')[0] || 'unknown';
  const newestArchived = rowsToArchive[rowsToArchive.length - 1][1]?.split('T')[0] || 'unknown';

  console.log(`   Orders to archive: ${rowsToArchive.length.toLocaleString()} (${oldestDate} to ${newestArchived})`);
  console.log(`   Orders to keep: ${rowsToKeep.length.toLocaleString()}\n`);

  // Step A: Append archive rows to archive spreadsheet (safe — additive only)
  console.log(`   Step A: Appending ${rowsToArchive.length.toLocaleString()} rows to unique_orders_archive...`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: archiveSpreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A:AQ`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rowsToArchive,
    },
  });
  console.log(`   ✅ Archived ${rowsToArchive.length.toLocaleString()} rows to unique_orders_archive`);

  // Step B: Overwrite main sheet with header + kept rows
  // Original data stays until overwritten — no data loss if this fails
  const keepData = [headerRow, ...rowsToKeep];
  console.log(`   Step B: Overwriting unique_orders_status with ${rowsToKeep.length.toLocaleString()} kept rows...`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: uniqueStatusSpreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: keepData,
    },
  });
  console.log(`   ✅ Overwrote sheet with ${rowsToKeep.length.toLocaleString()} rows + header`);

  // Step C: Trim trailing excess rows (old data beyond the new row count)
  const excessRows = rows.length - keepData.length;
  if (excessRows > 0) {
    console.log(`   Step C: Trimming ${excessRows.toLocaleString()} trailing excess rows...`);

    // Get sheet ID for deleteDimension
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: uniqueStatusSpreadsheetId,
    });
    const sheet = sheetMetadata.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAMES.UNIQUE_ORDER_STATUS
    );

    if (!sheet || (sheet.properties?.sheetId == null)) {
      throw new Error(`Sheet ${SHEET_NAMES.UNIQUE_ORDER_STATUS} not found`);
    }

    const sheetId = sheet.properties.sheetId!;

    // Single deleteDimension call to remove all trailing rows at once
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: uniqueStatusSpreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: keepData.length, // 0-indexed, first row to delete
                endIndex: rows.length, // exclusive
              },
            },
          },
        ],
      },
    });
    console.log(`   ✅ Trimmed ${excessRows.toLocaleString()} excess rows`);
  }

  console.log(
    `\n   ✅ Archived ${rowsToArchive.length.toLocaleString()} orders (older than ${RETENTION_DAYS} days) from unique_orders_status`
  );
  console.log(`   Remaining orders: ${rowsToKeep.length.toLocaleString()}`);
  return rowsToArchive.length;
}

/**
 * Enforce retention policy on all DASHBOARD sheets
 * This should run daily at 3 AM IST (after all syncs complete)
 */
export async function enforceRetentionPolicy(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  DASHBOARD RETENTION POLICY ENFORCEMENT       ║');
  console.log('╚════════════════════════════════════════════════╝');

  if (!DASHBOARD_SHEETS_ID) {
    console.error('❌ DASHBOARD_SHEETS_ID not configured. Skipping retention cleanup.');
    return;
  }

  try {
    const startTime = new Date();
    let totalRowsDeleted = 0;

    // Clean org_hourly_metrics (30 days)
    const orgRowsDeleted = await deleteOldRows(
      'org_hourly_metrics',
      RETENTION_POLICIES.org_hourly_metrics.retentionDays,
      RETENTION_POLICIES.org_hourly_metrics.columnIndex
    );
    totalRowsDeleted += orgRowsDeleted;

    // Clean person_hourly_performance (30 days)
    const personRowsDeleted = await deleteOldRows(
      'person_hourly_performance',
      RETENTION_POLICIES.person_hourly_performance.retentionDays,
      RETENTION_POLICIES.person_hourly_performance.columnIndex
    );
    totalRowsDeleted += personRowsDeleted;

    // Clean person_level_queues (keep only latest)
    const queueRowsDeleted = await keepLatestSnapshotsOnly();
    totalRowsDeleted += queueRowsDeleted;

    // Archive old unique_orders_status (75% capacity trigger)
    const uniqueOrdersArchived = await archiveOldUniqueOrders();
    totalRowsDeleted += uniqueOrdersArchived;

    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  RETENTION CLEANUP SUMMARY                     ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`   Total rows deleted: ${totalRowsDeleted}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Completed at: ${endTime.toISOString()}`);
    console.log('');

    if (totalRowsDeleted > 0) {
      console.log('✅ Retention policy enforced successfully');
    } else {
      console.log('✅ No cleanup needed - all data within retention limits');
    }
  } catch (error) {
    console.error('❌ Error enforcing retention policy:', error);
    throw error;
  }
}

/**
 * Get current cell count for DASHBOARD spreadsheet
 * Useful for monitoring capacity
 */
export async function getDashboardCellCount(): Promise<number> {
  const sheets = getSheetsClient();
  const spreadsheetId = DASHBOARD_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error('DASHBOARD_SHEETS_ID not configured');
  }

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });

  let totalCells = 0;

  metadata.data.sheets?.forEach((sheet) => {
    const rows = sheet.properties?.gridProperties?.rowCount || 0;
    const cols = sheet.properties?.gridProperties?.columnCount || 0;
    const cellCount = rows * cols;

    console.log(
      `   ${sheet.properties?.title}: ${rows} rows × ${cols} cols = ${cellCount.toLocaleString()} cells`
    );

    totalCells += cellCount;
  });

  return totalCells;
}

/**
 * Test retention policy (dry-run mode)
 * Shows what would be deleted without actually deleting
 */
export async function testRetentionPolicy(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  RETENTION POLICY DRY-RUN TEST                 ║');
  console.log('╚════════════════════════════════════════════════╝');

  if (!DASHBOARD_SHEETS_ID) {
    console.error('❌ DASHBOARD_SHEETS_ID not configured.');
    return;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = DASHBOARD_SHEETS_ID;

  // Test org_hourly_metrics
  console.log('\n📋 org_hourly_metrics (30-day retention):');
  const cutoff30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const orgResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'org_hourly_metrics!A:M',
  });
  const orgRows = orgResponse.data.values || [];
  const orgOldRows = orgRows.slice(1).filter((r) => (r[2] || '') < cutoff30);
  console.log(`   Would delete: ${orgOldRows.length} rows older than ${cutoff30}`);

  // Test person_hourly_performance
  console.log('\n📋 person_hourly_performance (30-day retention):');
  const personResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'person_hourly_performance!A:M',
  });
  const personRows = personResponse.data.values || [];
  const personOldRows = personRows.slice(1).filter((r) => (r[2] || '') < cutoff30);
  console.log(`   Would delete: ${personOldRows.length} rows older than ${cutoff30}`);

  // Test person_level_queues
  console.log('\n📋 person_level_queues (latest-only retention):');
  const queueResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'person_level_queues!A:L',
  });
  const queueRows = queueResponse.data.values || [];
  const latestByPerson = new Map<string, number>();
  queueRows.slice(1).forEach((row, i) => {
    const personId = row[4] || '';
    const timestamp = row[0] || '';
    if (!personId) return;

    const existing = latestByPerson.get(personId);
    if (!existing || timestamp > queueRows[existing][0]) {
      latestByPerson.set(personId, i + 1);
    }
  });
  const queueOldRows = queueRows.length - 1 - latestByPerson.size;
  console.log(
    `   Would delete: ${queueOldRows} old snapshots (keep ${latestByPerson.size} latest)`
  );

  console.log('\n✅ Dry-run test completed (no data was deleted)');
}
