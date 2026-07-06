import { google } from 'googleapis';
import type { EVOrderSnapshot, EVDailySummary } from '../../types/evMetrics';
import type { SyncLogEntry } from '../../types/sync';
import { toISTTimestamp } from '../../utils/timezone';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  return process.env[key];
};

// Get Tech Metrics SHEETS_ID dynamically
export const getTechMetricsSheetsId = () => getEnv('VITE_TECH_METRICS_SHEETS_ID');

// Sheet names for Tech Metrics
export const TECH_METRICS_SHEET_NAMES = {
  EV_RAW_SNAPSHOTS: 'ev_raw_snapshots',
  EV_SYNC_LOG: 'ev_sync_log',
  EV_METRICS_DAILY: 'ev_metrics_daily',
  RPA_RAW_SNAPSHOTS: 'rpa_raw_snapshots',
  RPA_SYNC_LOG: 'rpa_sync_log',
};

/**
 * Initialize Google Sheets API client for Tech Metrics sheet
 * Uses same service account credentials as PA Orders Analytics
 */
export function getTechMetricsSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Append EV raw snapshots to the ev_raw_snapshots sheet
 * This is the bronze layer - raw data from Algolia
 */
export async function appendEVRawSnapshots(snapshots: EVOrderSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getTechMetricsSheetsClient();

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.snapshot_hour_ist,
    s.snapshot_date,
    s.order_id,
    s.facility_id,
    s.created_at_date,
    s.primary_active || '',
    s.primary_payer_name || '',
    s.ev_bv_primary || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`[Tech Metrics] Appended ${rows.length} EV raw snapshots to Google Sheets`);
}

/**
 * Record EV sync log entry
 */
export async function recordEVSyncLog(entry: SyncLogEntry): Promise<void> {
  const sheets = getTechMetricsSheetsClient();

  const row = [
    entry.facility_id,
    entry.date,
    entry.sync_start_timestamp,
    entry.sync_end_timestamp || '',
    entry.status,
    entry.error_message || '',
    entry.records_synced || 0,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });

  console.log(`[Tech Metrics] Recorded EV sync log for ${entry.facility_id} on ${entry.date}`);
}

/**
 * Update sync log entry status (mark as completed or failed)
 */
export async function updateEVSyncLogStatus(
  facility_id: string,
  date: string,
  status: 'completed' | 'failed',
  error_message?: string,
  records_synced?: number
): Promise<void> {
  const sheets = getTechMetricsSheetsClient();

  // Read existing log entries
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1); // Skip header

  // Find the row to update (most recent entry for this facility+date with in_progress status)
  let rowIndex = -1;
  for (let i = dataRows.length - 1; i >= 0; i--) {
    const row = dataRows[i];
    if (row[0] === facility_id && row[1] === date && row[4] === 'in_progress') {
      rowIndex = i + 2; // +2 because: +1 for header, +1 for 1-indexed
      break;
    }
  }

  if (rowIndex === -1) {
    console.warn(`[Tech Metrics] No in_progress sync log found for ${facility_id} on ${date}`);
    return;
  }

  // Update the row
  const updatedRow = [
    facility_id,
    date,
    dataRows[rowIndex - 2][2], // Keep original sync_start_timestamp
    toISTTimestamp(new Date()), // sync_end_timestamp
    status,
    error_message || '',
    records_synced || 0,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A${rowIndex}:G${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRow],
    },
  });

  console.log(`[Tech Metrics] Updated EV sync log status to ${status} for ${facility_id} on ${date}`);
}

// ============================================================================
// RPA WRITE OPERATIONS
// ============================================================================

/**
 * Append RPA raw snapshots to the rpa_raw_snapshots sheet
 * This is the bronze layer - raw data from Algolia
 */
export async function appendRPARawSnapshots(snapshots: any[]): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getTechMetricsSheetsClient();

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.order_id,
    s.org_id,
    s.created_at,
    s.username,
    s.master_auth_status,
    s.ev_write_back_status,
    s.document_upload_status,
    s.health_first_nar_rpa_status || '',
    s.date_of_work || '',
    s.assigned_to,
    s.is_worked ? 'TRUE' : 'FALSE',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_RAW_SNAPSHOTS}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`[Tech Metrics] Appended ${rows.length} RPA raw snapshots to Google Sheets`);
}

/**
 * Record RPA sync log entry
 */
export async function recordRPASyncLog(entry: SyncLogEntry): Promise<void> {
  const sheets = getTechMetricsSheetsClient();

  const row = [
    entry.facility_id,
    entry.date,
    entry.sync_start_timestamp,
    entry.sync_end_timestamp || '',
    entry.status,
    entry.error_message || '',
    entry.records_synced || 0,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });

  console.log(`[Tech Metrics] Recorded RPA sync log for ${entry.facility_id} on ${entry.date}`);
}

/**
 * Update RPA sync log entry status (mark as completed or failed)
 */
export async function updateRPASyncLogStatus(
  facility_id: string,
  date: string,
  status: 'completed' | 'failed',
  error_message?: string,
  records_synced?: number
): Promise<void> {
  const sheets = getTechMetricsSheetsClient();

  // Read existing log entries
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1); // Skip header

  // Find the row to update (most recent entry for this facility+date with in_progress status)
  let rowIndex = -1;
  for (let i = dataRows.length - 1; i >= 0; i--) {
    const row = dataRows[i];
    if (row[0] === facility_id && row[1] === date && row[4] === 'in_progress') {
      rowIndex = i + 2; // +2 because: +1 for header, +1 for 1-indexed
      break;
    }
  }

  if (rowIndex === -1) {
    console.warn(`[Tech Metrics] No in_progress RPA sync log found for ${facility_id} on ${date}`);
    return;
  }

  // Update the row
  const updatedRow = [
    facility_id,
    date,
    dataRows[rowIndex - 2][2], // Keep original sync_start_timestamp
    toISTTimestamp(new Date()), // sync_end_timestamp
    status,
    error_message || '',
    records_synced || 0,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG}!A${rowIndex}:G${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRow],
    },
  });

  console.log(`[Tech Metrics] Updated RPA sync log status to ${status} for ${facility_id} on ${date}`);
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get EV raw snapshots for a date range and facilities
 * This reads from the bronze layer
 */
export async function getEVRawSnapshots(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<EVOrderSnapshot[]> {
  const sheets = getTechMetricsSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS}!A2:I`, // Skip header row
  });

  const rows = response.data.values || [];

  // Parse rows into EVOrderSnapshot objects
  const snapshots: EVOrderSnapshot[] = rows
    .map((row): EVOrderSnapshot | null => {
      if (row.length < 6) return null; // Skip incomplete rows

      return {
        snapshot_timestamp: row[0] || '',
        snapshot_hour_ist: row[1] || '',
        snapshot_date: row[2] || '',
        order_id: row[3] || '',
        facility_id: row[4] || '',
        created_at_date: row[5] || '',
        primary_active: normalizeActiveStatus(row[6]),
        primary_payer_name: row[7] || null,
        ev_bv_primary: row[8] || null,
      };
    })
    .filter((s): s is EVOrderSnapshot => s !== null);

  // Filter by date range (extract date part from timestamp)
  const filtered = snapshots.filter((s) => {
    // Extract YYYY-MM-DD from created_at_date (which may contain full timestamp)
    const datePart = s.created_at_date.split(' ')[0];
    return datePart >= startDate && datePart <= endDate;
  });

  // Filter by facilities (if specified)
  const result =
    facilityIds.length === 0
      ? filtered
      : filtered.filter((s) => facilityIds.includes(s.facility_id));

  console.log(
    `[Tech Metrics] Retrieved ${result.length} EV snapshots for ${facilityIds.length > 0 ? facilityIds.join(', ') : 'all facilities'} from ${startDate} to ${endDate}`
  );

  return result;
}

/**
 * Get latest sync log entry for a facility and date
 */
export async function getLastEVSyncInfo(facility_id: string, date: string): Promise<SyncLogEntry | null> {
  const sheets = getTechMetricsSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A2:G`, // Skip header
  });

  const rows = response.data.values || [];

  // Find the most recent entry for this facility and date
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row[0] === facility_id && row[1] === date) {
      return {
        facility_id: row[0],
        date: row[1],
        sync_start_timestamp: row[2],
        sync_end_timestamp: row[3] || null,
        status: row[4] as 'in_progress' | 'completed' | 'failed',
        error_message: row[5] || null,
        records_synced: row[6] ? parseInt(row[6], 10) : null,
      };
    }
  }

  return null;
}

/**
 * Get all sync log entries for a date range
 */
export async function getEVSyncLogs(startDate: string, endDate: string): Promise<SyncLogEntry[]> {
  const sheets = getTechMetricsSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A2:G`, // Skip header
  });

  const rows = response.data.values || [];

  const logs: SyncLogEntry[] = rows
    .map((row): SyncLogEntry | null => {
      if (row.length < 5) return null;

      const date = row[1];
      if (date < startDate || date > endDate) return null;

      return {
        facility_id: row[0],
        date: row[1],
        sync_start_timestamp: row[2],
        sync_end_timestamp: row[3] || null,
        status: row[4] as 'in_progress' | 'completed' | 'failed',
        error_message: row[5] || null,
        records_synced: row[6] ? parseInt(row[6], 10) : null,
      };
    })
    .filter((log): log is SyncLogEntry => log !== null);

  return logs;
}

// ============================================================================
// EV METRICS DAILY - PRE-AGGREGATED (UPSERT)
// ============================================================================

/**
 * Append or update EV metrics daily in TECH_METRICS spreadsheet (upsert logic)
 * Sheet: ev_metrics_daily
 * UPSERT key: created_at_date + facility_id
 * Follows same pattern as appendOrUpdateBusinessMetrics in sheets-dual.ts
 */
export async function appendOrUpdateEVMetricsDaily(
  metrics: EVDailySummary[]
): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getTechMetricsSheetsClient();
  const sheetId = getTechMetricsSheetsId();

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY}!A:U`,
  });

  const existingRows = response.data.values || [];
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
      metric.orders_active,
      metric.orders_inactive,
      metric.orders_unknown,
      metric.ev_completed,
      metric.ev_in_progress,
      metric.ev_error_total,
      metric.ev_error_timeout,
      metric.ev_error_auth,
      metric.ev_error_network,
      metric.ev_error_validation,
      metric.ev_error_type_not_supported,
      metric.ev_error_rate_limit,
      metric.ev_error_other,
      metric.pct_active,
      metric.pct_inactive,
      metric.pct_completed,
      metric.pct_error,
      metric.last_updated_timestamp,
    ];

    const existingRowIndex = existingMap.get(key);

    if (existingRowIndex !== undefined) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY}!A${existingRowIndex}:U${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `[Tech Metrics] Updated EV metrics daily for ${metric.facility_id} on ${metric.created_at_date}`
      );
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY}!A:U`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(
        `[Tech Metrics] Appended EV metrics daily for ${metric.facility_id} on ${metric.created_at_date}`
      );
    }
  }
}

/**
 * Get EV metrics daily for a date range and facilities
 * Reads from pre-aggregated ev_metrics_daily sheet
 * Follows same pattern as getBusinessMetricsForRange in sheets-dual.ts
 */
export async function getEVMetricsDailyForRange(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<EVDailySummary[]> {
  const sheets = getTechMetricsSheetsClient();
  const sheetId = getTechMetricsSheetsId();

  console.log(
    `[Tech Metrics] Fetching ev_metrics_daily for ${facilityIds.length > 0 ? facilityIds.join(', ') : 'all facilities'} from ${startDate} to ${endDate}...`
  );

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY}!A:U`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log('[Tech Metrics] No data found in ev_metrics_daily');
    return [];
  }

  const facilitySet = new Set(facilityIds);
  const metrics: EVDailySummary[] = [];

  // Skip header row and filter
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

    metrics.push({
      created_at_date: createdAtDate,
      facility_id: facilityId,
      total_orders: parseInt(row[2]) || 0,
      orders_active: parseInt(row[3]) || 0,
      orders_inactive: parseInt(row[4]) || 0,
      orders_unknown: parseInt(row[5]) || 0,
      ev_completed: parseInt(row[6]) || 0,
      ev_in_progress: parseInt(row[7]) || 0,
      ev_error_total: parseInt(row[8]) || 0,
      ev_error_timeout: parseInt(row[9]) || 0,
      ev_error_auth: parseInt(row[10]) || 0,
      ev_error_network: parseInt(row[11]) || 0,
      ev_error_validation: parseInt(row[12]) || 0,
      ev_error_type_not_supported: parseInt(row[13]) || 0,
      ev_error_rate_limit: parseInt(row[14]) || 0,
      ev_error_other: parseInt(row[15]) || 0,
      pct_active: parseFloat(row[16]) || 0,
      pct_inactive: parseFloat(row[17]) || 0,
      pct_completed: parseFloat(row[18]) || 0,
      pct_error: parseFloat(row[19]) || 0,
      last_updated_timestamp: row[20] || '',
    });
  }

  console.log(`[Tech Metrics] Found ${metrics.length} EV metrics daily rows`);
  return metrics;
}

// ============================================================================
// RPA READ OPERATIONS
// ============================================================================

/**
 * Get RPA raw snapshots for a date range and facilities
 * This reads from the bronze layer
 */
export async function getRPARawSnapshots(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<any[]> {
  const sheets = getTechMetricsSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_RAW_SNAPSHOTS}!A2:L`, // Skip header row
  });

  const rows = response.data.values || [];

  // Parse rows into RPAOrderSnapshot objects
  const snapshots: any[] = rows
    .map((row): any | null => {
      if (row.length < 11) return null; // Skip incomplete rows

      return {
        snapshot_timestamp: row[0] || '',
        order_id: row[1] || '',
        org_id: row[2] || '',
        created_at: row[3] || '',
        username: row[4] || '',
        master_auth_status: row[5] || '',
        ev_write_back_status: row[6] || 'not_initiated',
        document_upload_status: row[7] || 'not_initiated',
        health_first_nar_rpa_status: row[8] || 'not_initiated',
        date_of_work: row[9] || null,
        assigned_to: row[10] || '',
        is_worked: row[11] === 'TRUE',
      };
    })
    .filter((s): s is any => s !== null);

  // Filter by date range (use date_of_work)
  const filtered = snapshots.filter((s) => {
    if (!s.date_of_work) return false;
    const datePart = s.date_of_work.split('T')[0]; // Extract YYYY-MM-DD
    return datePart >= startDate && datePart <= endDate;
  });

  // Filter by facilities (if specified)
  const result =
    facilityIds.length === 0
      ? filtered
      : filtered.filter((s) => facilityIds.includes(s.org_id));

  console.log(
    `[Tech Metrics] Retrieved ${result.length} RPA snapshots for ${facilityIds.length > 0 ? facilityIds.join(', ') : 'all facilities'} from ${startDate} to ${endDate}`
  );

  return result;
}

/**
 * Get latest RPA sync log entry for a facility and date
 */
export async function getLastRPASyncInfo(facility_id: string, date: string): Promise<SyncLogEntry | null> {
  const sheets = getTechMetricsSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getTechMetricsSheetsId(),
    range: `${TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG}!A2:G`, // Skip header
  });

  const rows = response.data.values || [];

  // Find the most recent entry for this facility and date
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row[0] === facility_id && row[1] === date) {
      return {
        facility_id: row[0],
        date: row[1],
        sync_start_timestamp: row[2],
        sync_end_timestamp: row[3] || null,
        status: row[4] as 'in_progress' | 'completed' | 'failed',
        error_message: row[5] || null,
        records_synced: row[6] ? parseInt(row[6], 10) : null,
      };
    }
  }

  return null;
}

// ============================================================================
// SETUP & INITIALIZATION
// ============================================================================

/**
 * Initialize Tech Metrics sheets with headers if they don't exist
 */
export async function initializeTechMetricsSheets(): Promise<void> {
  const sheets = getTechMetricsSheetsClient();
  const sheetId = getTechMetricsSheetsId();

  console.log('[Tech Metrics] Initializing sheets...');

  // Check if sheets exist
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
  });

  const existingSheets = spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  // Create ev_raw_snapshots if not exists
  if (!existingSheets.includes(TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS)) {
    await createSheet(sheets, sheetId, TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS);
  }

  // Create ev_sync_log if not exists
  if (!existingSheets.includes(TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG)) {
    await createSheet(sheets, sheetId, TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG);
  }

  // Create ev_metrics_daily if not exists
  if (!existingSheets.includes(TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY)) {
    await createSheet(sheets, sheetId, TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY);
  }

  // Create rpa_raw_snapshots if not exists
  if (!existingSheets.includes(TECH_METRICS_SHEET_NAMES.RPA_RAW_SNAPSHOTS)) {
    await createSheet(sheets, sheetId, TECH_METRICS_SHEET_NAMES.RPA_RAW_SNAPSHOTS);
  }

  // Create rpa_sync_log if not exists
  if (!existingSheets.includes(TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG)) {
    await createSheet(sheets, sheetId, TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG);
  }

  // Set headers for ev_raw_snapshots
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          'snapshot_timestamp',
          'snapshot_hour_ist',
          'snapshot_date',
          'order_id',
          'facility_id',
          'created_at_date',
          'primary_active',
          'primary_payer_name',
          'ev_bv_primary',
        ],
      ],
    },
  });

  // Set headers for ev_sync_log
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A1:G1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          'facility_id',
          'date',
          'sync_start_timestamp',
          'sync_end_timestamp',
          'status',
          'error_message',
          'records_synced',
        ],
      ],
    },
  });

  // Set headers for ev_metrics_daily
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_METRICS_DAILY}!A1:U1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          'created_at_date',
          'facility_id',
          'total_orders',
          'orders_active',
          'orders_inactive',
          'orders_unknown',
          'ev_completed',
          'ev_in_progress',
          'ev_error_total',
          'ev_error_timeout',
          'ev_error_auth',
          'ev_error_network',
          'ev_error_validation',
          'ev_error_type_not_supported',
          'ev_error_rate_limit',
          'ev_error_other',
          'pct_active',
          'pct_inactive',
          'pct_completed',
          'pct_error',
          'last_updated_timestamp',
        ],
      ],
    },
  });

  // Set headers for rpa_raw_snapshots
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.RPA_RAW_SNAPSHOTS}!A1:L1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          'snapshot_timestamp',
          'order_id',
          'org_id',
          'created_at',
          'username',
          'master_auth_status',
          'ev_write_back_status',
          'document_upload_status',
          'health_first_nar_rpa_status',
          'date_of_work',
          'assigned_to',
          'is_worked',
        ],
      ],
    },
  });

  // Set headers for rpa_sync_log
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.RPA_SYNC_LOG}!A1:G1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          'facility_id',
          'date',
          'sync_start_timestamp',
          'sync_end_timestamp',
          'status',
          'error_message',
          'records_synced',
        ],
      ],
    },
  });

  console.log('[Tech Metrics] Sheets initialized successfully');
}

/**
 * Create a new sheet tab
 */
async function createSheet(sheets: any, spreadsheetId: string, sheetTitle: string): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetTitle,
            },
          },
        },
      ],
    },
  });

  console.log(`[Tech Metrics] Created sheet: ${sheetTitle}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize primary_active status from Algolia
 */
function normalizeActiveStatus(status: string | null | undefined): 'active' | 'inactive' | 'unknown' | null {
  if (!status) return null;

  const lower = status.toLowerCase().trim();

  if (lower === 'active' || lower === 'active coverage') return 'active';
  if (lower === 'inactive' || lower === 'inactive coverage') return 'inactive';
  if (lower === 'coverage unknown' || lower === 'unknown') return 'unknown';

  // Default to unknown for unrecognized values
  return 'unknown';
}

/**
 * Clear all data from Tech Metrics sheets (use with caution!)
 */
export async function clearTechMetricsSheets(): Promise<void> {
  const sheets = getTechMetricsSheetsClient();
  const sheetId = getTechMetricsSheetsId();

  console.warn('[Tech Metrics] Clearing all data from Tech Metrics sheets...');

  // Clear ev_raw_snapshots (keep headers)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_RAW_SNAPSHOTS}!A2:I`,
  });

  // Clear ev_sync_log (keep headers)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `${TECH_METRICS_SHEET_NAMES.EV_SYNC_LOG}!A2:G`,
  });

  console.log('[Tech Metrics] All data cleared successfully');
}
