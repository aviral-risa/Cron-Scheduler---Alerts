/**
 * Dual-Spreadsheet Service
 *
 * This service implements the dual-write logic to fix the Google Sheets 10M cell limit issue.
 * It routes data writes to appropriate spreadsheets:
 *
 * RAW DATA LAKE (orders_raw_hourly, config_sync_log):
 *   - Append-only storage for raw order snapshots
 *   - ~324k cells/day growth rate
 *   - ~30 days capacity before archival needed
 *
 * DASHBOARD METRICS (org/person metrics, daily_summary, etc.):
 *   - Aggregated metrics with auto-retention
 *   - Retention policy keeps cell count < 40k (0.4% of limit)
 *   - Never needs manual cleanup
 */

import { google } from 'googleapis';
import type {
  OrderSnapshot,
  OrgMetrics,
  PersonMetrics,
  WorkingDayConfig,
  DailySummary,
  UniqueOrderStatus,
  BusinessMetricsDaily,
} from '../types/orders';
import type { PayerTreatmentAgingRow } from '../types/payerTreatmentAging';
import type { SyncLogEntry } from '../types/sync';
import type { PersonQueueSnapshot } from '../types/queue';
import { toISTTimestamp } from '../utils/timezone';
import {
  RAW_DATA_SHEETS_ID,
  DASHBOARD_SHEETS_ID,
  isDualSpreadsheetMode,
  LEGACY_SHEETS_ID,
  getCurrentArchiveSpreadsheetId,
  QUEUE_SHEETS_ID,
} from '../config/data-source.config';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  return process.env[key];
};

// Sheet names (same as original sheets.ts)
export const SHEET_NAMES = {
  RAW_HOURLY: 'orders_raw_hourly',
  ORG_METRICS: 'org_hourly_metrics',
  PERSON_METRICS: 'person_hourly_performance',
  WORKING_DAYS: 'config_working_days',
  DAILY_SUMMARY: 'daily_summary',
  SYNC_LOG: 'config_sync_log',
  PERSON_QUEUES: 'person_level_queues',
  UNIQUE_ORDER_STATUS: 'unique_orders_status',
  BUSINESS_METRICS_DAILY: 'business_metrics_daily',
  UNIQUE_ORDER_ARCHIVE: 'unique_orders_archive',
  QUEUE_DAILY_LOG: 'queue_daily_log', // Permanent storage for daily queue snapshots
  PAYER_TREATMENT_AGING: 'payer_treatment_aging',
};

/**
 * Initialize Google Sheets API client
 */
export function getSheetsClient() {
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
 * Get spreadsheet ID for a given sheet type
 * Falls back to legacy single spreadsheet if dual mode not configured
 */
export function getSpreadsheetId(sheetType: 'raw' | 'dashboard' | 'unique_status' | 'archive' | 'queue' | 'payer_aging'): string | undefined {
  if (!isDualSpreadsheetMode()) {
    console.warn(
      '⚠️  Dual-spreadsheet mode not configured. Using legacy single spreadsheet.'
    );
    return getEnv('VITE_GOOGLE_SHEETS_ID');
  }

  switch (sheetType) {
    case 'raw':
      return getEnv('VITE_RAW_DATA_SHEETS_ID');
    case 'dashboard':
      return getEnv('VITE_DASHBOARD_SHEETS_ID');
    case 'unique_status':
      return getEnv('VITE_UNIQUE_STATUS_SHEETS_ID') || getEnv('VITE_DASHBOARD_SHEETS_ID'); // Fallback to dashboard if not configured
    case 'queue':
      // Dedicated queue spreadsheet, with fallback chain
      return getEnv('VITE_QUEUE_SHEETS_ID') || getEnv('VITE_UNIQUE_STATUS_SHEETS_ID') || getEnv('VITE_DASHBOARD_SHEETS_ID');
    case 'archive':
      return getCurrentArchiveSpreadsheetId();
    case 'payer_aging':
      return getEnv('VITE_PAYER_AGING_SHEETS_ID');
    default:
      return getEnv('VITE_GOOGLE_SHEETS_ID');
  }
}

/**
 * Append order snapshots to RAW DATA LAKE
 * Sheet: orders_raw_hourly
 * Location: RAW_DATA_SHEETS_ID
 */
export async function appendOrderSnapshots(
  snapshots: OrderSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.snapshot_hour_ist,
    s.order_id,
    s.facility_id,
    s.provider_name || '',
    s.master_auth_status,
    s.created_at,
    s.created_at_date,
    s.assigned_at || '',
    s.date_of_work || '',
    s.is_assigned,
    s.is_worked,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.RAW_HOURLY}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(
    `✅ Appended ${rows.length} order snapshots to RAW DATA LAKE (${spreadsheetId})`
  );
}

/**
 * Append org metrics to DASHBOARD
 * Sheet: org_hourly_metrics
 * Location: DASHBOARD_SHEETS_ID
 * Retention: 30 days (enforced by retention policy)
 */
export async function appendOrgMetrics(metrics: OrgMetrics[]): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  const rows = metrics.map((m) => [
    m.snapshot_timestamp,
    m.snapshot_hour_ist,
    m.created_at_date,
    m.facility_id,
    m.orders_loaded_today,
    m.orders_assigned,
    m.orders_worked,
    m.orders_not_worked_assigned,
    m.work_rate_pct,
    m.avg_worked_last_7_working_days,
    m.pace_vs_avg,
    m.pace_status,
    m.projected_eod_worked,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.ORG_METRICS}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(
    `✅ Appended ${rows.length} org metrics to DASHBOARD (${spreadsheetId})`
  );
}

/**
 * Append person metrics to DASHBOARD
 * Sheet: person_hourly_performance
 * Location: DASHBOARD_SHEETS_ID
 * Retention: 30 days (enforced by retention policy)
 */
export async function appendPersonMetrics(
  metrics: PersonMetrics[]
): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  const rows = metrics.map((m) => [
    m.snapshot_timestamp,
    m.snapshot_hour_ist,
    m.created_at_date,
    m.facility_id,
    m.provider_name,
    m.assigned_count,
    m.worked_count,
    m.not_worked_count,
    m.avg_worked_last_7_working_days,
    m.person_pace_vs_avg,
    m.person_pace_status,
    m.login_time || '',
    m.logoff_time || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.PERSON_METRICS}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(
    `✅ Appended ${rows.length} person metrics to DASHBOARD (${spreadsheetId})`
  );
}

/**
 * Append or update daily summary in DASHBOARD (upsert logic)
 * Sheet: daily_summary
 * Location: DASHBOARD_SHEETS_ID
 * Retention: 90 days (enforced by retention policy)
 */
export async function appendOrUpdateDailySummary(
  summaries: DailySummary[]
): Promise<void> {
  if (summaries.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.DAILY_SUMMARY}!A:Q`,
  });

  const existingRows = response.data.values || [];
  const headerRow = existingRows[0] || [];
  const dataRows = existingRows.slice(1);

  // Create a map of existing rows: "date|facilityId" -> row index
  const existingMap = new Map<string, number>();
  dataRows.forEach((row, index) => {
    const key = `${row[0]}|${row[1]}`; // created_at_date|facility_id
    existingMap.set(key, index + 2); // +2 because: +1 for header, +1 for 1-indexed
  });

  for (const summary of summaries) {
    const key = `${summary.created_at_date}|${summary.facility_id}`;
    const row = [
      summary.created_at_date,
      summary.facility_id,
      summary.total_orders,
      summary.orders_assigned,
      summary.orders_completed,
      summary.status_auth_by_risa,
      summary.status_auth_on_file,
      summary.status_no_auth_required,
      summary.status_denial_by_risa,
      summary.status_denial_after_query,
      summary.status_existing_denial,
      summary.status_query,
      summary.status_pending,
      summary.status_hold,
      summary.status_auth_required,
      summary.status_other,
      summary.last_updated_timestamp,
    ];

    const existingRowIndex = existingMap.get(key);

    if (existingRowIndex !== undefined) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAMES.DAILY_SUMMARY}!A${existingRowIndex}:Q${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `✅ Updated daily summary for ${summary.facility_id} on ${summary.created_at_date} in DASHBOARD`
      );
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAMES.DAILY_SUMMARY}!A:Q`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `✅ Appended daily summary for ${summary.facility_id} on ${summary.created_at_date} to DASHBOARD`
      );
    }
  }
}

/**
 * Get existing unique order status map from UNIQUE_STATUS spreadsheet
 * Reads all orders and creates a map: order_id -> UniqueOrderStatus
 * Used for efficient UPSERT operations
 */
export async function getExistingOrderStatusMap(): Promise<Map<string, UniqueOrderStatus>> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1); // Skip header

  const orderMap = new Map<string, UniqueOrderStatus>();

  for (const row of dataRows) {
    const order: UniqueOrderStatus = {
      order_id: row[0],
      created_at_iso: row[1],
      indexed_at_iso: row[2],
      assigned_to_name: row[3] || null,
      primary_payer_name: row[4] || null,
      regimen_name: row[5] || null,
      date_of_service_iso: row[6] || null,
      org_id: row[7],
      primary_active: row[8] || null,
      ev_bv_primary: row[9] || null,
      document_upload_status: row[10] || null,
      ev_write_back_status: row[11] || null,
      bo_status: row[12] || null,
      master_auth_status: row[13],
      mark_as_completed: row[14] === 'true' ? true : row[14] === 'false' ? false : null,
      auth_on_file_status: row[15] || null,
      auth_on_file_updated_at: row[16] || null,
      auth_status: row[17] || null,
      medical_order_status: row[18] || null,
      regimen_type: row[19] || null,
      auth_on_file_error_type: row[20] || null,
      auth_on_file_error_message: row[21] || null,
      nar_check_status: row[22] || null,
      date_of_work_iso: row[23] || null,
      assigned_at_iso: row[24] || null,
      health_first_nar_rpa_status: row[25] || null,
      submission: row[26] || null,
      fax_submission_status: row[27] || null,
      medical_order_review_status: row[28] || null,
      fields_hash: row[29],
      first_synced_at: row[30],
      last_synced_at: row[31],
      last_changed_at: row[32],
      sync_count: parseInt(row[33]) || 0,
      change_count: parseInt(row[34]) || 0,
      auth_status_ever_changed: row[35] === 'true',
      auth_status_change_count: parseInt(row[36]) || 0,
      auth_status_last_change_from: row[37] || null,
      auth_status_last_change_to: row[38] || null,
      auth_status_last_changed_at: row[39] || null,
      bo_count: row[40] ? parseInt(row[40]) : null,
      patient_mrn: row[41] || null,
      is_duplicate: row[42] === 'TRUE',
    };

    orderMap.set(order.order_id, order);
  }

  console.log(`Read ${orderMap.size} existing unique order statuses from UNIQUE_STATUS spreadsheet`);
  return orderMap;
}

/**
 * Lightweight fetch for Agent Mode metrics - reads only the 8 columns needed
 * instead of all 43 columns (A:AQ), reducing memory usage by ~80%.
 * Returns partial UniqueOrderStatus objects with only the fields used by
 * agent-mode calculations: order_id, created_at_iso, primary_payer_name,
 * org_id, auth_status, medical_order_status, medical_order_review_status, is_duplicate
 */
export async function getOrdersForAgentModeMetrics(): Promise<UniqueOrderStatus[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');
  const sheetName = SHEET_NAMES.UNIQUE_ORDER_STATUS;

  // Batch-read only the columns we need (8 out of 43)
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      `${sheetName}!A:B`,   // order_id (0), created_at_iso (1)
      `${sheetName}!E:E`,   // primary_payer_name (4)
      `${sheetName}!H:H`,   // org_id (7)
      `${sheetName}!R:S`,   // auth_status (17), medical_order_status (18)
      `${sheetName}!AC:AC`, // medical_order_review_status (28)
      `${sheetName}!AQ:AQ`, // is_duplicate (42)
    ],
  });

  const ranges = response.data.valueRanges || [];
  const colAB = ranges[0]?.values || [];
  const colE = ranges[1]?.values || [];
  const colH = ranges[2]?.values || [];
  const colRS = ranges[3]?.values || [];
  const colAC = ranges[4]?.values || [];
  const colAQ = ranges[5]?.values || [];

  // Skip header row, determine row count from column A
  const rowCount = colAB.length - 1;
  if (rowCount <= 0) return [];

  const orders: UniqueOrderStatus[] = [];

  for (let i = 1; i <= rowCount; i++) {
    const rowAB = colAB[i] || [];
    const rowE = colE[i] || [];
    const rowH = colH[i] || [];
    const rowRS = colRS[i] || [];
    const rowAC = colAC[i] || [];
    const rowAQ = colAQ[i] || [];

    orders.push({
      order_id: rowAB[0] || '',
      created_at_iso: rowAB[1] || '',
      indexed_at_iso: '',
      assigned_to_name: null,
      primary_payer_name: rowE[0] || null,
      regimen_name: null,
      date_of_service_iso: null,
      org_id: rowH[0] || '',
      primary_active: null,
      ev_bv_primary: null,
      document_upload_status: null,
      ev_write_back_status: null,
      bo_status: null,
      master_auth_status: '',
      mark_as_completed: null,
      auth_on_file_status: null,
      auth_on_file_updated_at: null,
      auth_status: rowRS[0] || null,
      medical_order_status: rowRS[1] || null,
      regimen_type: null,
      auth_on_file_error_type: null,
      auth_on_file_error_message: null,
      nar_check_status: null,
      date_of_work_iso: null,
      assigned_at_iso: null,
      health_first_nar_rpa_status: null,
      submission: null,
      fax_submission_status: null,
      medical_order_review_status: rowAC[0] || null,
      fields_hash: '',
      first_synced_at: '',
      last_synced_at: '',
      last_changed_at: '',
      sync_count: 0,
      change_count: 0,
      auth_status_ever_changed: false,
      auth_status_change_count: 0,
      auth_status_last_change_from: null,
      auth_status_last_change_to: null,
      auth_status_last_changed_at: null,
      bo_count: null,
      patient_mrn: null,
      is_duplicate: rowAQ[0] === 'TRUE',
    } as UniqueOrderStatus);
  }

  console.log(`[AgentMode] Lightweight fetch: ${orders.length} orders (8 columns only)`);
  return orders;
}

/**
 * Append or update unique order status in UNIQUE_STATUS spreadsheet (upsert logic)
 * Sheet: unique_orders_status
 * Location: UNIQUE_STATUS_SHEETS_ID
 * OPTIMIZED: Uses batch operations to avoid API quota limits
 */
export async function appendOrUpdateUniqueOrderStatus(
  orders: UniqueOrderStatus[]
): Promise<void> {
  if (orders.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const existingRows = response.data.values || [];
  const dataRows = existingRows.slice(1);

  // Create map: order_id -> row index
  const existingMap = new Map<string, number>();
  dataRows.forEach((row, index) => {
    const orderId = row[0];
    existingMap.set(orderId, index + 2); // +2 for header and 1-indexed
  });

  // Separate orders into inserts and updates
  const insertsRows: any[][] = [];
  const updateRequests: any[] = [];

  for (const order of orders) {
    const row = [
      order.order_id,
      order.created_at_iso,
      order.indexed_at_iso,
      order.assigned_to_name ?? '',
      order.primary_payer_name ?? '',
      order.regimen_name ?? '',
      order.date_of_service_iso ?? '',
      order.org_id,
      order.primary_active ?? '',
      order.ev_bv_primary ?? '',
      order.document_upload_status ?? '',
      order.ev_write_back_status ?? '',
      order.bo_status ?? '',
      order.master_auth_status,
      order.mark_as_completed?.toString() ?? '',
      order.auth_on_file_status ?? '',
      order.auth_on_file_updated_at ?? '',
      order.auth_status ?? '',
      order.medical_order_status ?? '',
      order.regimen_type ?? '',
      order.auth_on_file_error_type ?? '',
      order.auth_on_file_error_message ?? '',
      order.nar_check_status ?? '',
      order.date_of_work_iso ?? '',
      order.assigned_at_iso ?? '',
      order.health_first_nar_rpa_status ?? '',
      order.submission ?? '',
      order.fax_submission_status ?? '',
      order.medical_order_review_status ?? '',
      order.fields_hash,
      order.first_synced_at,
      order.last_synced_at,
      order.last_changed_at,
      order.sync_count,
      order.change_count,
      order.auth_status_ever_changed.toString(),
      order.auth_status_change_count,
      order.auth_status_last_change_from ?? '',
      order.auth_status_last_change_to ?? '',
      order.auth_status_last_changed_at ?? '',
      order.bo_count ?? '',
      order.patient_mrn ?? '',
      order.is_duplicate ? 'TRUE' : '',
    ];

    const existingRowIndex = existingMap.get(order.order_id);

    if (existingRowIndex !== undefined) {
      // Collect update requests for batch update
      updateRequests.push({
        range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A${existingRowIndex}:AQ${existingRowIndex}`,
        values: [row],
      });
    } else {
      // Collect rows for batch insert
      insertsRows.push(row);
    }
  }

  // Batch append all new rows in a single request
  if (insertsRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: insertsRows },
    });
    console.log(`✅ Appended ${insertsRows.length} new orders to UNIQUE_STATUS`);
  }

  // Batch update all existing rows using batchUpdate
  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updateRequests,
      },
    });
    console.log(`✅ Updated ${updateRequests.length} existing orders in UNIQUE_STATUS`);
  }

  console.log(
    `✅ Wrote ${orders.length} unique order statuses to UNIQUE_STATUS (${spreadsheetId})`
  );
}

/**
 * Get latest order snapshots from RAW DATA LAKE
 * Reads from orders_raw_hourly and returns latest snapshot for each order
 */
export async function getLatestOrderSnapshots(
  date: string,
  facilityId?: string
): Promise<OrderSnapshot[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  console.log(
    `Reading orders_raw_hourly from RAW DATA LAKE for date: ${date}${facilityId ? ` (facility: ${facilityId})` : ''}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.RAW_HOURLY}!A:L`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in orders_raw_hourly');
    return [];
  }

  // Skip header row and parse data
  const snapshots: OrderSnapshot[] = [];
  const latestSnapshotsByOrder = new Map<string, OrderSnapshot>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Extract created_at_date from row (column H)
    const createdAtDate = row[7] || '';

    // Filter by date
    if (createdAtDate !== date) {
      continue;
    }

    // Filter by facility if specified
    const rowFacilityId = row[3] || '';
    if (facilityId && rowFacilityId !== facilityId) {
      continue;
    }

    // Parse snapshot
    const snapshot: OrderSnapshot = {
      snapshot_timestamp: row[0] || '',
      snapshot_hour_ist: row[1] || '',
      order_id: row[2] || '',
      facility_id: rowFacilityId,
      provider_name: row[4] || null,
      master_auth_status: row[5] || 'unknown',
      created_at: row[6] || '',
      created_at_date: createdAtDate,
      assigned_at: row[8] || null,
      date_of_work: row[9] || null,
      is_assigned: row[10] === 'TRUE' || row[10] === true,
      is_worked: row[11] === 'TRUE' || row[11] === true,
    };

    // Keep latest snapshot for each order_id
    const existing = latestSnapshotsByOrder.get(snapshot.order_id);
    if (!existing || snapshot.snapshot_timestamp > existing.snapshot_timestamp) {
      latestSnapshotsByOrder.set(snapshot.order_id, snapshot);
    }
  }

  // Convert map to array
  const result = Array.from(latestSnapshotsByOrder.values());
  console.log(
    `Found ${result.length} latest order snapshots for ${date}${facilityId ? ` (${facilityId})` : ''}`
  );

  return result;
}

/**
 * Get latest person metrics from DASHBOARD
 * Returns the most recent snapshot for each provider on the given date
 */
export async function getLatestPersonMetrics(
  date: string,
  facilityId: string
): Promise<PersonMetrics[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  console.log(
    `Reading person_hourly_performance from DASHBOARD for date: ${date} (facility: ${facilityId})...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.PERSON_METRICS}!A:M`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in person_hourly_performance');
    return [];
  }

  // Skip header row and parse data
  const providerMap = new Map<string, PersonMetrics>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Extract created_at_date and facility_id
    const createdAtDate = row[2] || '';
    const rowFacilityId = row[3] || '';

    // Filter by date and facility
    if (createdAtDate !== date || rowFacilityId !== facilityId) {
      continue;
    }

    const providerName = row[4] || '';
    const timestamp = row[0] || '';

    // Parse person metrics
    const metric: PersonMetrics = {
      snapshot_timestamp: timestamp,
      snapshot_hour_ist: row[1] || '',
      created_at_date: createdAtDate,
      facility_id: rowFacilityId,
      provider_name: providerName,
      assigned_count: parseInt(row[5]) || 0,
      worked_count: parseInt(row[6]) || 0,
      not_worked_count: parseInt(row[7]) || 0,
      avg_worked_last_7_working_days: parseFloat(row[8]) || 0,
      person_pace_vs_avg: parseFloat(row[9]) || 0,
      person_pace_status:
        (row[10] as 'AHEAD' | 'ON_PACE' | 'BEHIND') || 'ON_PACE',
      login_time: row[11] || null,
      logoff_time: row[12] || null,
    };

    // Keep latest snapshot for each provider
    const existing = providerMap.get(providerName);
    if (!existing || timestamp > existing.snapshot_timestamp) {
      providerMap.set(providerName, metric);
    }
  }

  // Convert map to array
  const result = Array.from(providerMap.values());
  console.log(
    `Found ${result.length} providers with metrics for ${date} (${facilityId})`
  );

  return result;
}

/**
 * Get person metrics for date range from DASHBOARD
 * Optimized bulk read with in-memory filtering
 */
export async function getPersonMetricsForDateRange(
  dates: string[],
  facilityIds: string[]
): Promise<Map<string, PersonMetrics[]>> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  // Read entire person_hourly_performance sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.PERSON_METRICS}!A:N`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    console.log('No person metrics data found');
    return new Map();
  }

  // Parse header to get column indices
  const header = rows[0];
  const colIndices: Record<string, number> = {};
  header.forEach((col: string, idx: number) => {
    colIndices[col] = idx;
  });

  // Create sets for fast filtering
  const dateSet = new Set(dates);
  const facilitySet = new Set(facilityIds);

  // Map: "date|facilityId" -> PersonMetrics[]
  const resultMap = new Map<string, PersonMetrics[]>();

  // Track latest timestamp per provider per date/facility
  const providerMap = new Map<string, Map<string, PersonMetrics>>();

  // Skip header, process all rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const date = row[colIndices.created_at_date];
    const facilityId = row[colIndices.facility_id];
    const providerName = row[colIndices.provider_name];
    const snapshotTimestamp = row[colIndices.snapshot_timestamp];

    // Filter by dates and facilityIds
    if (!dateSet.has(date) || !facilitySet.has(facilityId)) {
      continue;
    }

    const personMetric: PersonMetrics = {
      snapshot_timestamp: snapshotTimestamp,
      snapshot_hour_ist: row[colIndices.snapshot_hour_ist] || '',
      created_at_date: date,
      facility_id: facilityId,
      provider_name: providerName,
      assigned_count: parseInt(row[colIndices.assigned_count] || '0', 10),
      worked_count: parseInt(row[colIndices.worked_count] || '0', 10),
      not_worked_count: parseInt(row[colIndices.not_worked_count] || '0', 10),
      avg_worked_last_7_working_days: parseFloat(
        row[colIndices.avg_worked_last_7_working_days] || '0'
      ),
      person_pace_vs_avg: parseFloat(
        row[colIndices.person_pace_vs_avg] || '0'
      ),
      person_pace_status: (row[colIndices.person_pace_status] || 'ON_PACE') as
        | 'AHEAD'
        | 'ON_PACE'
        | 'BEHIND',
      login_time: row[colIndices.login_time] || null,
      logoff_time: row[colIndices.logoff_time] || null,
    };

    // Key for this date/facility combination
    const key = `${date}|${facilityId}`;

    // Initialize nested map if not exists
    if (!providerMap.has(key)) {
      providerMap.set(key, new Map());
    }

    const innerMap = providerMap.get(key)!;

    // Keep only the latest snapshot for each provider
    const existingMetric = innerMap.get(providerName);
    if (
      !existingMetric ||
      snapshotTimestamp > existingMetric.snapshot_timestamp
    ) {
      innerMap.set(providerName, personMetric);
    }
  }

  // Convert nested maps to result map
  providerMap.forEach((innerMap, key) => {
    resultMap.set(key, Array.from(innerMap.values()));
  });

  console.log(
    `Bulk fetched person metrics for ${dates.length} dates and ${facilityIds.length} facilities. Found ${resultMap.size} date-facility combinations.`
  );

  return resultMap;
}

/**
 * Get working day configuration from DASHBOARD
 */
export async function getWorkingDayConfig(
  date: string
): Promise<WorkingDayConfig | null> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.WORKING_DAYS}!A:D`,
  });

  const rows = response.data.values || [];

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === date) {
      return {
        date: row[0],
        is_working_day: row[1] === 'TRUE' || row[1] === true,
        day_type: row[2] || '',
        notes: row[3] || '',
      };
    }
  }

  return null;
}

/**
 * Set working day configuration in DASHBOARD
 */
export async function setWorkingDayConfig(
  date: string,
  isWorkingDay: boolean,
  dayType: string,
  notes: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  // Check if configuration already exists
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.WORKING_DAYS}!A:D`,
  });

  const rows = response.data.values || [];
  let existingRowIndex = -1;

  // Skip header row, find existing entry
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === date) {
      existingRowIndex = i + 1; // +1 because sheets are 1-indexed
      break;
    }
  }

  const rowData = [
    date,
    isWorkingDay.toString().toUpperCase(),
    dayType,
    notes,
  ];

  if (existingRowIndex > 0) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.WORKING_DAYS}!A${existingRowIndex}:D${existingRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    });
    console.log(`✅ Updated working day config for ${date} in DASHBOARD`);
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAMES.WORKING_DAYS}!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    });
    console.log(`✅ Added working day config for ${date} to DASHBOARD`);
  }
}

/**
 * Read historical org metrics from DASHBOARD
 */
export async function getHistoricalOrgMetrics(
  facilityId: string,
  startDate: string,
  endDate: string
): Promise<OrgMetrics[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.ORG_METRICS}!A:M`,
  });

  const rows = response.data.values || [];
  const metrics: OrgMetrics[] = [];

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[3] === facilityId) {
      // facility_id is column 3 (index 3)
      const snapshotDate = row[0].split('T')[0];
      if (snapshotDate >= startDate && snapshotDate <= endDate) {
        metrics.push({
          snapshot_timestamp: row[0],
          snapshot_hour_ist: row[1],
          created_at_date: row[2],
          facility_id: row[3],
          orders_loaded_today: parseInt(row[4]) || 0,
          orders_assigned: parseInt(row[5]) || 0,
          orders_worked: parseInt(row[6]) || 0,
          orders_not_worked_assigned: parseInt(row[7]) || 0,
          work_rate_pct: parseFloat(row[8]) || 0,
          avg_worked_last_7_working_days: parseFloat(row[9]) || 0,
          pace_vs_avg: parseInt(row[10]) || 0,
          pace_status: row[11] as 'AHEAD' | 'ON_PACE' | 'BEHIND',
          projected_eod_worked: parseInt(row[12]) || 0,
        });
      }
    }
  }

  return metrics;
}

/**
 * Initialize sheets with headers
 */
export async function initializeSheets(): Promise<void> {
  const sheets = getSheetsClient();
  const rawSpreadsheetId = getSpreadsheetId('raw');
  const dashboardSpreadsheetId = getSpreadsheetId('dashboard');

  const headers = {
    [SHEET_NAMES.RAW_HOURLY]: [
      'snapshot_timestamp',
      'snapshot_hour_ist',
      'order_id',
      'facility_id',
      'provider_name',
      'master_auth_status',
      'created_at',
      'created_at_date',
      'assigned_at',
      'date_of_work',
      'is_assigned',
      'is_worked',
    ],
    [SHEET_NAMES.ORG_METRICS]: [
      'snapshot_timestamp',
      'snapshot_hour_ist',
      'created_at_date',
      'facility_id',
      'orders_loaded_today',
      'orders_assigned',
      'orders_worked',
      'orders_not_worked_assigned',
      'work_rate_pct',
      'avg_worked_last_7_working_days',
      'pace_vs_avg',
      'pace_status',
      'projected_eod_worked',
    ],
    [SHEET_NAMES.PERSON_METRICS]: [
      'snapshot_timestamp',
      'snapshot_hour_ist',
      'created_at_date',
      'facility_id',
      'provider_name',
      'assigned_count',
      'worked_count',
      'not_worked_count',
      'avg_worked_last_7_working_days',
      'person_pace_vs_avg',
      'person_pace_status',
      'login_time',
      'logoff_time',
    ],
    [SHEET_NAMES.WORKING_DAYS]: ['date', 'is_working_day', 'day_type', 'notes'],
    [SHEET_NAMES.DAILY_SUMMARY]: [
      'created_at_date',
      'facility_id',
      'total_orders',
      'orders_assigned',
      'orders_completed',
      'status_auth_by_risa',
      'status_auth_on_file',
      'status_no_auth_required',
      'status_denial_by_risa',
      'status_denial_after_query',
      'status_existing_denial',
      'status_query',
      'status_pending',
      'status_hold',
      'status_auth_required',
      'status_other',
      'last_updated_timestamp',
    ],
    [SHEET_NAMES.SYNC_LOG]: [
      'facility_id',
      'date',
      'sync_start_timestamp',
      'sync_end_timestamp',
      'status',
      'error_message',
      'records_synced',
    ],
    [SHEET_NAMES.PERSON_QUEUES]: [
      'snapshot_timestamp',
      'snapshot_date',
      'snapshot_hour',
      'person_name',
      'person_id',
      'facility_id',
      'new',
      'pending',
      'query',
      'hold',
      'auth_required',
      'total_open_orders',
    ],
  };

  // Raw Data Lake sheets
  const rawSheets = [SHEET_NAMES.RAW_HOURLY, SHEET_NAMES.SYNC_LOG];

  // Dashboard sheets
  const dashboardSheets = [
    SHEET_NAMES.ORG_METRICS,
    SHEET_NAMES.PERSON_METRICS,
    SHEET_NAMES.WORKING_DAYS,
    SHEET_NAMES.DAILY_SUMMARY,
    SHEET_NAMES.PERSON_QUEUES,
  ];

  // Initialize Raw Data Lake sheets
  for (const sheetName of rawSheets) {
    try {
      const headerRow = headers[sheetName];
      await createSheetIfNotExists(sheets, rawSpreadsheetId!, sheetName);
      await sheets.spreadsheets.values.update({
        spreadsheetId: rawSpreadsheetId,
        range: `${sheetName}!A1:${String.fromCharCode(65 + headerRow.length - 1)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headerRow],
        },
      });
      console.log(`✅ Initialized RAW DATA LAKE sheet: ${sheetName}`);
    } catch (error) {
      console.error(`Error initializing RAW sheet ${sheetName}:`, error);
    }
  }

  // Initialize Dashboard sheets
  for (const sheetName of dashboardSheets) {
    try {
      const headerRow = headers[sheetName];
      await createSheetIfNotExists(sheets, dashboardSpreadsheetId!, sheetName);
      await sheets.spreadsheets.values.update({
        spreadsheetId: dashboardSpreadsheetId,
        range: `${sheetName}!A1:${String.fromCharCode(65 + headerRow.length - 1)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headerRow],
        },
      });
      console.log(`✅ Initialized DASHBOARD sheet: ${sheetName}`);
    } catch (error) {
      console.error(`Error initializing DASHBOARD sheet ${sheetName}:`, error);
    }
  }
}

/**
 * Create a new sheet tab if it doesn't exist
 */
async function createSheetIfNotExists(
  sheets: any,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  try {
    // Check if sheet exists by getting metadata
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetExists = response.data.sheets?.some(
      (sheet: any) => sheet.properties?.title === sheetName
    );

    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      console.log(`Created sheet: ${sheetName}`);
    }
  } catch (error) {
    console.error(`Error checking/creating sheet ${sheetName}:`, error);
    throw error;
  }
}

/**
 * Get latest sync log entry from RAW DATA LAKE
 */
export async function getLastSyncInfo(
  facilityId: string,
  date: string
): Promise<SyncLogEntry | null> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    return null;
  }

  // Find the latest sync for this facility+date
  let latestEntry: SyncLogEntry | null = null;

  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const rowFacilityId = row[0];
    const rowDate = row[1];

    if (rowFacilityId === facilityId && rowDate === date) {
      latestEntry = {
        facility_id: rowFacilityId,
        date: rowDate,
        sync_start_timestamp: row[2] || '',
        sync_end_timestamp: row[3] || '',
        status:
          (row[4] as 'in_progress' | 'completed' | 'failed') || 'in_progress',
        error_message: row[5] || undefined,
        records_synced: parseInt(row[6]) || 0,
      };
      break; // Found the latest (last) matching entry
    }
  }

  return latestEntry;
}

/**
 * Record sync start to RAW DATA LAKE
 */
export async function recordSyncStart(
  facilityId: string,
  date: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  const timestamp = toISTTimestamp(new Date());

  const row = [facilityId, date, timestamp, '', 'in_progress', '', 0];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  });

  console.log(
    `✅ Recorded sync start for ${facilityId} on ${date} at ${timestamp} in RAW DATA LAKE`
  );
}

/**
 * Record sync completion to RAW DATA LAKE
 */
export async function recordSyncComplete(
  facilityId: string,
  date: string,
  recordCount: number
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  const timestamp = toISTTimestamp(new Date());

  // Get all rows to find the latest in_progress entry
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];
  let rowIndexToUpdate = -1;
  let latestStartTimestamp = '';

  // Find the latest in_progress row for this facility+date
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (
      row[0] === facilityId &&
      row[1] === date &&
      row[4] === 'in_progress' &&
      row[2] > latestStartTimestamp
    ) {
      latestStartTimestamp = row[2];
      rowIndexToUpdate = i + 1; // +1 for 1-indexed sheets
    }
  }

  if (rowIndexToUpdate > 0) {
    // Update the row with completion info
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.SYNC_LOG}!D${rowIndexToUpdate}:G${rowIndexToUpdate}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[timestamp, 'completed', '', recordCount]],
      },
    });
    console.log(
      `✅ Recorded sync completion for ${facilityId} on ${date} - ${recordCount} records in RAW DATA LAKE`
    );
  } else {
    console.warn(
      `No in_progress sync found to update for ${facilityId} on ${date}`
    );
  }
}

/**
 * Record sync failure to RAW DATA LAKE
 */
export async function recordSyncFailure(
  facilityId: string,
  date: string,
  errorMessage: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('raw');

  const timestamp = toISTTimestamp(new Date());

  // Get all rows to find the latest in_progress entry
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];
  let rowIndexToUpdate = -1;
  let latestStartTimestamp = '';

  // Find the latest in_progress row for this facility+date
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (
      row[0] === facilityId &&
      row[1] === date &&
      row[4] === 'in_progress' &&
      row[2] > latestStartTimestamp
    ) {
      latestStartTimestamp = row[2];
      rowIndexToUpdate = i + 1;
    }
  }

  if (rowIndexToUpdate > 0) {
    // Update the row with failure info
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.SYNC_LOG}!D${rowIndexToUpdate}:G${rowIndexToUpdate}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[timestamp, 'failed', errorMessage, 0]],
      },
    });
    console.log(
      `✅ Recorded sync failure for ${facilityId} on ${date}: ${errorMessage} in RAW DATA LAKE`
    );
  } else {
    console.warn(
      `No in_progress sync found to update for ${facilityId} on ${date}`
    );
  }
}

/**
 * Get daily summary for date range from DASHBOARD
 */
export async function getDailySummaryForRange(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<DailySummary[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  console.log(
    `Fetching daily_summary from DASHBOARD for ${facilityIds.length} facilities from ${startDate} to ${endDate}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.DAILY_SUMMARY}!A:Q`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in daily_summary');
    return [];
  }

  // Skip header row and filter by date range and facilities
  const summaries: DailySummary[] = [];
  const facilitySet = new Set(facilityIds);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const createdAtDate = row[0] || '';
    const facilityId = row[1] || '';

    // Filter by date range
    if (createdAtDate < startDate || createdAtDate > endDate) {
      continue;
    }

    // Filter by facilities (if provided)
    if (facilityIds.length > 0 && !facilitySet.has(facilityId)) {
      continue;
    }

    // Parse summary
    const summary: DailySummary = {
      created_at_date: createdAtDate,
      facility_id: facilityId,
      total_orders: parseInt(row[2]) || 0,
      orders_assigned: parseInt(row[3]) || 0,
      orders_completed: parseInt(row[4]) || 0,
      status_auth_by_risa: parseInt(row[5]) || 0,
      status_auth_on_file: parseInt(row[6]) || 0,
      status_no_auth_required: parseInt(row[7]) || 0,
      status_denial_by_risa: parseInt(row[8]) || 0,
      status_denial_after_query: parseInt(row[9]) || 0,
      status_existing_denial: parseInt(row[10]) || 0,
      status_query: parseInt(row[11]) || 0,
      status_pending: parseInt(row[12]) || 0,
      status_hold: parseInt(row[13]) || 0,
      status_auth_required: parseInt(row[14]) || 0,
      status_other: parseInt(row[15]) || 0,
      last_updated_timestamp: row[16] || '',
    };

    summaries.push(summary);
  }

  console.log(`Found ${summaries.length} daily summary rows from DASHBOARD`);
  return summaries;
}

/**
 * Get working days in range from DASHBOARD
 */
export async function getWorkingDaysInRange(
  startDate: string,
  endDate: string
): Promise<WorkingDayConfig[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  console.log(
    `Fetching config_working_days from DASHBOARD from ${startDate} to ${endDate}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.WORKING_DAYS}!A:D`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in config_working_days');
    return [];
  }

  // Skip header row and filter by date range
  const configs: WorkingDayConfig[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = row[0] || '';

    // Filter by date range
    if (date < startDate || date > endDate) {
      continue;
    }

    // Parse config
    const config: WorkingDayConfig = {
      date,
      is_working_day:
        row[1] === 'TRUE' || row[1] === true || row[1] === 'true',
      day_type: row[2] || '',
      notes: row[3] || '',
    };

    configs.push(config);
  }

  console.log(
    `Found ${configs.length} working day config entries from DASHBOARD`
  );
  return configs;
}

/**
 * Append person queue snapshots to DASHBOARD
 */
export async function appendPersonQueueSnapshots(
  snapshots: PersonQueueSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.snapshot_date,
    s.snapshot_hour,
    s.person_name,
    s.person_id,
    s.facility_id,
    s.new,
    s.pending,
    s.query,
    s.hold,
    s.auth_required,
    s.total_open_orders,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.PERSON_QUEUES}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(
    `✅ Appended ${rows.length} person queue snapshots to DASHBOARD (${spreadsheetId})`
  );
}

/**
 * Get latest person queue snapshots from DASHBOARD
 */
export async function getLatestPersonQueueSnapshots(
  facilityIds?: string[]
): Promise<PersonQueueSnapshot[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('dashboard');

  console.log(`Reading person_level_queues from DASHBOARD...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.PERSON_QUEUES}!A:L`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in person_level_queues');
    return [];
  }

  // Skip header row and parse data
  const personMap = new Map<string, PersonQueueSnapshot>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const personId = row[4] || '';
    const facilityId = row[5] || '';
    const timestamp = row[0] || '';

    // Filter by facility IDs if provided
    if (facilityIds && facilityIds.length > 0 && !facilityIds.includes(facilityId)) {
      continue;
    }

    // Parse person queue snapshot
    const snapshot: PersonQueueSnapshot = {
      snapshot_timestamp: timestamp,
      snapshot_date: row[1] || '',
      snapshot_hour: row[2] || '',
      person_name: row[3] || '',
      person_id: personId,
      facility_id: facilityId,
      new: parseInt(row[6]) || 0,
      pending: parseInt(row[7]) || 0,
      query: parseInt(row[8]) || 0,
      hold: parseInt(row[9]) || 0,
      auth_required: parseInt(row[10]) || 0,
      total_open_orders: parseInt(row[11]) || 0,
    };

    // Keep latest snapshot for each person (by person_id)
    const key = personId;
    const existing = personMap.get(key);
    if (!existing || timestamp > existing.snapshot_timestamp) {
      personMap.set(key, snapshot);
    }
  }

  // Convert map to array
  const result = Array.from(personMap.values());
  console.log(
    `Found ${result.length} people with queue snapshots from DASHBOARD`
  );

  return result;
}

/**
 * Append queue daily log to QUEUE spreadsheet
 * Sheet: queue_daily_log
 * Location: VITE_QUEUE_SHEETS_ID (dedicated Queue spreadsheet)
 * Retention: Permanent (no retention - stores historical daily queue snapshots)
 *
 * This is the primary storage for queue metrics, running once at 11:59 PM IST daily.
 * Unlike person_level_queues (which only keeps latest), this stores ALL daily snapshots
 * for historical analysis and trend tracking.
 */
export async function appendQueueDailyLog(
  snapshots: PersonQueueSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('queue');

  if (!spreadsheetId) {
    console.error('QUEUE_SHEETS_ID not configured. Skipping queue daily log.');
    return;
  }

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.snapshot_date,
    s.snapshot_hour,
    s.person_name,
    s.person_id,
    s.facility_id,
    s.new,
    s.pending,
    s.query,
    s.hold,
    s.auth_required,
    s.total_open_orders,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.QUEUE_DAILY_LOG}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(
    `✅ Appended ${rows.length} queue snapshots to queue_daily_log in QUEUE spreadsheet (${spreadsheetId})`
  );
}

/**
 * Get queue daily log for a date range from QUEUE spreadsheet
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @param facilityIds Optional array of facility IDs to filter by
 * @returns Array of PersonQueueSnapshot for the date range
 */
export async function getQueueDailyLogForRange(
  startDate: string,
  endDate: string,
  facilityIds?: string[]
): Promise<PersonQueueSnapshot[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('queue');

  if (!spreadsheetId) {
    console.error('QUEUE_SHEETS_ID not configured.');
    return [];
  }

  console.log(`Reading queue_daily_log from QUEUE spreadsheet for ${startDate} to ${endDate}...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.QUEUE_DAILY_LOG}!A:L`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in queue_daily_log');
    return [];
  }

  const snapshots: PersonQueueSnapshot[] = [];

  // Skip header row and parse data
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const snapshotDate = row[1] || '';
    const facilityId = row[5] || '';

    // Filter by date range
    if (snapshotDate < startDate || snapshotDate > endDate) {
      continue;
    }

    // Filter by facility IDs if provided
    if (facilityIds && facilityIds.length > 0 && !facilityIds.includes(facilityId)) {
      continue;
    }

    snapshots.push({
      snapshot_timestamp: row[0] || '',
      snapshot_date: snapshotDate,
      snapshot_hour: row[2] || '',
      person_name: row[3] || '',
      person_id: row[4] || '',
      facility_id: facilityId,
      new: parseInt(row[6]) || 0,
      pending: parseInt(row[7]) || 0,
      query: parseInt(row[8]) || 0,
      hold: parseInt(row[9]) || 0,
      auth_required: parseInt(row[10]) || 0,
      total_open_orders: parseInt(row[11]) || 0,
    });
  }

  console.log(`Found ${snapshots.length} queue snapshots for ${startDate} to ${endDate}`);
  return snapshots;
}

/**
 * Get latest queue snapshots from queue_daily_log (one per person)
 * Returns the most recent snapshot for each person from the QUEUE spreadsheet
 * @param facilityIds Optional array of facility IDs to filter by
 * @returns Array of latest PersonQueueSnapshot for each person
 */
export async function getLatestFromQueueDailyLog(
  facilityIds?: string[]
): Promise<PersonQueueSnapshot[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('queue');

  if (!spreadsheetId) {
    console.error('QUEUE_SHEETS_ID not configured.');
    return [];
  }

  console.log('Reading latest snapshots from queue_daily_log...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.QUEUE_DAILY_LOG}!A:L`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in queue_daily_log');
    return [];
  }

  // Track latest snapshot per person
  const personMap = new Map<string, PersonQueueSnapshot>();

  // Skip header row and parse data
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const personId = row[4] || '';
    const facilityId = row[5] || '';
    const timestamp = row[0] || '';

    // Filter by facility IDs if provided
    if (facilityIds && facilityIds.length > 0 && !facilityIds.includes(facilityId)) {
      continue;
    }

    // Keep only the latest snapshot per person
    const existing = personMap.get(personId);
    if (!existing || timestamp > existing.snapshot_timestamp) {
      personMap.set(personId, {
        snapshot_timestamp: timestamp,
        snapshot_date: row[1] || '',
        snapshot_hour: row[2] || '',
        person_name: row[3] || '',
        person_id: personId,
        facility_id: facilityId,
        new: parseInt(row[6]) || 0,
        pending: parseInt(row[7]) || 0,
        query: parseInt(row[8]) || 0,
        hold: parseInt(row[9]) || 0,
        auth_required: parseInt(row[10]) || 0,
        total_open_orders: parseInt(row[11]) || 0,
      });
    }
  }

  const result = Array.from(personMap.values());
  console.log(`Found ${result.length} latest queue snapshots from queue_daily_log`);
  return result;
}

/**
 * Append or update business metrics daily in UNIQUE_STATUS spreadsheet (upsert logic)
 * Sheet: business_metrics_daily
 * Location: UNIQUE_STATUS_SHEETS_ID
 * Retention: Permanent (no retention - capacity impact negligible)
 */
export async function appendOrUpdateBusinessMetrics(
  metrics: BusinessMetricsDaily[]
): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A:X`, // 24 columns (A-X)
  });

  const existingRows = response.data.values || [];
  const headerRow = existingRows[0] || [];
  const dataRows = existingRows.slice(1);

  // Create a map of existing rows: "date|facilityId" -> row index
  const existingMap = new Map<string, number>();
  dataRows.forEach((row, index) => {
    const key = `${row[0]}|${row[1]}`; // created_at_date|facility_id
    existingMap.set(key, index + 2); // +2 because: +1 for header, +1 for 1-indexed
  });

  for (const metric of metrics) {
    const key = `${metric.created_at_date}|${metric.facility_id}`;
    const row = [
      metric.created_at_date,
      metric.facility_id,
      metric.total_orders,
      metric.orders_assigned,
      metric.orders_completed,
      metric.orders_inprogress,
      metric.total_billable_orders,
      metric.status_auth_by_risa,
      metric.status_auth_on_file,
      metric.status_no_auth_required,
      metric.status_denial_by_risa,
      metric.status_denial_after_query,
      metric.status_existing_denial,
      metric.status_query,
      metric.status_pending,
      metric.status_hold,
      metric.status_auth_required,
      metric.status_other,
      metric.approval_rate_pct,
      metric.authorization_rate_pct,
      metric.order_completion_pct,
      metric.order_inprogress_pct,
      metric.last_updated_timestamp,
      metric.distinct_users_worked, // NEW: Added at end for easy backfilling
    ];

    const existingRowIndex = existingMap.get(key);

    if (existingRowIndex !== undefined) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A${existingRowIndex}:X${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `✅ Updated business metrics for ${metric.facility_id} on ${metric.created_at_date} in UNIQUE_STATUS`
      );
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A:X`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `✅ Appended business metrics for ${metric.facility_id} on ${metric.created_at_date} to UNIQUE_STATUS`
      );
    }
  }
}

/**
 * Get business metrics for date range from UNIQUE_STATUS spreadsheet
 * Reads from business_metrics_daily sheet (pre-calculated metrics)
 */
export async function getBusinessMetricsForRange(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<BusinessMetricsDaily[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  console.log(
    `Fetching business_metrics_daily from UNIQUE_STATUS for ${facilityIds.length} facilities from ${startDate} to ${endDate}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A:X`, // 24 columns
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in business_metrics_daily');
    return [];
  }

  // Skip header row and filter by date range and facilities
  const metrics: BusinessMetricsDaily[] = [];
  const facilitySet = new Set(facilityIds);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const createdAtDate = row[0] || '';
    const facilityId = row[1] || '';

    // Filter by date range
    if (createdAtDate < startDate || createdAtDate > endDate) {
      continue;
    }

    // Filter by facilities (if provided)
    if (facilityIds.length > 0 && !facilitySet.has(facilityId)) {
      continue;
    }

    // Parse business metrics
    const metric: BusinessMetricsDaily = {
      created_at_date: createdAtDate,
      facility_id: facilityId,
      total_orders: parseInt(row[2]) || 0,
      orders_assigned: parseInt(row[3]) || 0,
      orders_completed: parseInt(row[4]) || 0,
      orders_inprogress: parseInt(row[5]) || 0,
      total_billable_orders: parseInt(row[6]) || 0,
      status_auth_by_risa: parseInt(row[7]) || 0,
      status_auth_on_file: parseInt(row[8]) || 0,
      status_no_auth_required: parseInt(row[9]) || 0,
      status_denial_by_risa: parseInt(row[10]) || 0,
      status_denial_after_query: parseInt(row[11]) || 0,
      status_existing_denial: parseInt(row[12]) || 0,
      status_query: parseInt(row[13]) || 0,
      status_pending: parseInt(row[14]) || 0,
      status_hold: parseInt(row[15]) || 0,
      status_auth_required: parseInt(row[16]) || 0,
      status_other: parseInt(row[17]) || 0,
      approval_rate_pct: parseFloat(row[18]) || 0,
      authorization_rate_pct: parseFloat(row[19]) || 0,
      order_completion_pct: parseFloat(row[20]) || 0,
      order_inprogress_pct: parseFloat(row[21]) || 0,
      last_updated_timestamp: row[22] || '',
      distinct_users_worked: parseInt(row[23]) || 0, // NEW: Distinct users who worked (excluding RISA Agent)
    };

    metrics.push(metric);
  }

  console.log(`Found ${metrics.length} business metrics rows from UNIQUE_STATUS`);
  return metrics;
}

/**
 * Get unique orders for a specific date and facility from UNIQUE_STATUS spreadsheet
 * Used for calculating business metrics
 */
export async function getUniqueOrdersForDate(
  date: string,
  facilityId: string
): Promise<UniqueOrderStatus[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  console.log(
    `Reading unique_orders_status from UNIQUE_STATUS for date: ${date}, facility: ${facilityId}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`, // 43 columns
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in unique_orders_status');
    return [];
  }

  // Skip header row and filter by date and facility
  const orders: UniqueOrderStatus[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Extract created_at_iso and org_id for filtering
    const createdAtIso = row[1] || '';
    const orgId = row[7] || '';

    // Extract date from ISO timestamp
    // Formats: "2026-01-15T10:30:00.000Z" or "2026-02-03 05:47:55.422169+00:00"
    const orderDate = createdAtIso.split('T')[0].split(' ')[0];

    // Filter by date and facility
    if (orderDate !== date || orgId !== facilityId) {
      continue;
    }

    const order: UniqueOrderStatus = {
      order_id: row[0],
      created_at_iso: createdAtIso,
      indexed_at_iso: row[2],
      assigned_to_name: row[3] || null,
      primary_payer_name: row[4] || null,
      regimen_name: row[5] || null,
      date_of_service_iso: row[6] || null,
      org_id: orgId,
      primary_active: row[8] || null,
      ev_bv_primary: row[9] || null,
      document_upload_status: row[10] || null,
      ev_write_back_status: row[11] || null,
      bo_status: row[12] || null,
      master_auth_status: row[13],
      mark_as_completed: row[14] === 'true' ? true : row[14] === 'false' ? false : null,
      auth_on_file_status: row[15] || null,
      auth_on_file_updated_at: row[16] || null,
      auth_status: row[17] || null,
      medical_order_status: row[18] || null,
      regimen_type: row[19] || null,
      auth_on_file_error_type: row[20] || null,
      auth_on_file_error_message: row[21] || null,
      nar_check_status: row[22] || null,
      date_of_work_iso: row[23] || null,
      assigned_at_iso: row[24] || null,
      health_first_nar_rpa_status: row[25] || null,
      submission: row[26] || null,
      fax_submission_status: row[27] || null,
      medical_order_review_status: row[28] || null,
      fields_hash: row[29],
      first_synced_at: row[30],
      last_synced_at: row[31],
      last_changed_at: row[32],
      sync_count: parseInt(row[33]) || 0,
      change_count: parseInt(row[34]) || 0,
      auth_status_ever_changed: row[35] === 'true',
      auth_status_change_count: parseInt(row[36]) || 0,
      auth_status_last_change_from: row[37] || null,
      auth_status_last_change_to: row[38] || null,
      auth_status_last_changed_at: row[39] || null,
      bo_count: row[40] ? parseInt(row[40]) : null,
      patient_mrn: row[41] || null,
      is_duplicate: row[42] === 'TRUE',
    };

    orders.push(order);
  }

  console.log(
    `Found ${orders.length} unique orders for ${date} (${facilityId})`
  );

  return orders;
}

/**
 * Get unique orders for a date range and optional facilities from UNIQUE_STATUS spreadsheet
 * Used for on-demand payer breakdown calculation
 */
export async function getUniqueOrdersForDateRange(
  startDate: string,
  endDate: string,
  facilityIds?: string[]
): Promise<UniqueOrderStatus[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  console.log(
    `Reading unique_orders_status from UNIQUE_STATUS for date range: ${startDate} to ${endDate}${facilityIds ? ` (facilities: ${facilityIds.join(', ')})` : ''}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in unique_orders_status');
    return [];
  }

  const facilitySet = facilityIds ? new Set(facilityIds) : null;
  const orders: UniqueOrderStatus[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const createdAtIso = row[1] || '';
    const orgId = row[7] || '';

    // Extract date from ISO timestamp
    const orderDate = createdAtIso.split('T')[0].split(' ')[0];

    // Filter by date range
    if (orderDate < startDate || orderDate > endDate) {
      continue;
    }

    // Filter by facilities (if provided)
    if (facilitySet && !facilitySet.has(orgId)) {
      continue;
    }

    const order: UniqueOrderStatus = {
      order_id: row[0],
      created_at_iso: createdAtIso,
      indexed_at_iso: row[2],
      assigned_to_name: row[3] || null,
      primary_payer_name: row[4] || null,
      regimen_name: row[5] || null,
      date_of_service_iso: row[6] || null,
      org_id: orgId,
      primary_active: row[8] || null,
      ev_bv_primary: row[9] || null,
      document_upload_status: row[10] || null,
      ev_write_back_status: row[11] || null,
      bo_status: row[12] || null,
      master_auth_status: row[13],
      mark_as_completed: row[14] === 'true' ? true : row[14] === 'false' ? false : null,
      auth_on_file_status: row[15] || null,
      auth_on_file_updated_at: row[16] || null,
      auth_status: row[17] || null,
      medical_order_status: row[18] || null,
      regimen_type: row[19] || null,
      auth_on_file_error_type: row[20] || null,
      auth_on_file_error_message: row[21] || null,
      nar_check_status: row[22] || null,
      date_of_work_iso: row[23] || null,
      assigned_at_iso: row[24] || null,
      health_first_nar_rpa_status: row[25] || null,
      submission: row[26] || null,
      fax_submission_status: row[27] || null,
      medical_order_review_status: row[28] || null,
      fields_hash: row[29],
      first_synced_at: row[30],
      last_synced_at: row[31],
      last_changed_at: row[32],
      sync_count: parseInt(row[33]) || 0,
      change_count: parseInt(row[34]) || 0,
      auth_status_ever_changed: row[35] === 'true',
      auth_status_change_count: parseInt(row[36]) || 0,
      auth_status_last_change_from: row[37] || null,
      auth_status_last_change_to: row[38] || null,
      auth_status_last_changed_at: row[39] || null,
      bo_count: row[40] ? parseInt(row[40]) : null,
      patient_mrn: row[41] || null,
      is_duplicate: row[42] === 'TRUE',
    };

    orders.push(order);
  }

  console.log(
    `Found ${orders.length} unique orders for ${startDate} to ${endDate}`
  );

  return orders;
}

/**
 * Append or update payer treatment aging rows in PAYER_AGING spreadsheet.
 * UPSERT with 3-part composite key: created_at_date|facility_id|payer_name (columns A+B+C)
 */
export async function appendOrUpdatePayerTreatmentAging(
  rows: PayerTreatmentAgingRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('payer_aging');

  if (!spreadsheetId) {
    throw new Error('VITE_PAYER_AGING_SHEETS_ID not configured');
  }

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.PAYER_TREATMENT_AGING}!A:N`, // 14 columns (A-N)
  });

  const existingRows = response.data.values || [];
  const dataRows = existingRows.slice(1);

  // Create a map of existing rows: "date|facilityId|payerName" -> row index
  const existingMap = new Map<string, number>();
  dataRows.forEach((row, index) => {
    const key = `${row[0]}|${row[1]}|${row[2]}`; // created_at_date|facility_id|payer_name
    existingMap.set(key, index + 2); // +2 for header + 1-indexed
  });

  const toUpdate: { range: string; values: any[][] }[] = [];
  const toAppend: any[][] = [];

  for (const metric of rows) {
    const key = `${metric.created_at_date}|${metric.facility_id}|${metric.payer_name}`;
    const row = [
      metric.created_at_date,
      metric.facility_id,
      metric.payer_name,
      metric.total_orders_loaded,
      metric.total_orders_billed,
      metric.loaded_0_to_7,
      metric.loaded_8_to_14,
      metric.loaded_15_to_21,
      metric.loaded_21_plus,
      metric.billed_0_to_7,
      metric.billed_8_to_14,
      metric.billed_15_to_21,
      metric.billed_21_plus,
      metric.last_updated_timestamp,
    ];

    const existingRowIndex = existingMap.get(key);

    if (existingRowIndex !== undefined) {
      toUpdate.push({
        range: `${SHEET_NAMES.PAYER_TREATMENT_AGING}!A${existingRowIndex}:N${existingRowIndex}`,
        values: [row],
      });
    } else {
      toAppend.push(row);
    }
  }

  // Batch update existing rows
  if (toUpdate.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: toUpdate,
      },
    });
    console.log(`✅ Updated ${toUpdate.length} existing payer aging rows`);
  }

  // Batch append new rows
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAMES.PAYER_TREATMENT_AGING}!A:N`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: toAppend,
      },
    });
    console.log(`✅ Appended ${toAppend.length} new payer aging rows`);
  }
}

/**
 * Get payer treatment aging data for date range from PAYER_AGING spreadsheet
 */
export async function getPayerTreatmentAgingForRange(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<PayerTreatmentAgingRow[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('payer_aging');

  if (!spreadsheetId) {
    throw new Error('VITE_PAYER_AGING_SHEETS_ID not configured');
  }

  console.log(
    `Fetching payer_treatment_aging for ${facilityIds.length} facilities from ${startDate} to ${endDate}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.PAYER_TREATMENT_AGING}!A:N`, // 14 columns
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('No data found in payer_treatment_aging');
    return [];
  }

  const results: PayerTreatmentAgingRow[] = [];
  const facilitySet = new Set(facilityIds);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const createdAtDate = row[0] || '';
    const facilityId = row[1] || '';

    // Filter by date range
    if (createdAtDate < startDate || createdAtDate > endDate) continue;

    // Filter by facilities (if provided)
    if (facilityIds.length > 0 && !facilitySet.has(facilityId)) continue;

    results.push({
      created_at_date: createdAtDate,
      facility_id: facilityId,
      payer_name: row[2] || '',
      total_orders_loaded: parseInt(row[3]) || 0,
      total_orders_billed: parseInt(row[4]) || 0,
      loaded_0_to_7: parseInt(row[5]) || 0,
      loaded_8_to_14: parseInt(row[6]) || 0,
      loaded_15_to_21: parseInt(row[7]) || 0,
      loaded_21_plus: parseInt(row[8]) || 0,
      billed_0_to_7: parseInt(row[9]) || 0,
      billed_8_to_14: parseInt(row[10]) || 0,
      billed_15_to_21: parseInt(row[11]) || 0,
      billed_21_plus: parseInt(row[12]) || 0,
      last_updated_timestamp: row[13] || '',
    });
  }

  console.log(`Found ${results.length} payer treatment aging rows`);
  return results;
}
