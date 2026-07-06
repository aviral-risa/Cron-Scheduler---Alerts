import { google } from 'googleapis';
import type { OrderSnapshot, OrgMetrics, PersonMetrics, WorkingDayConfig, DailySummary } from '../types/orders';
import type { SyncLogEntry } from '../types/sync';
import type { PersonQueueSnapshot } from '../types/queue';
import { toISTTimestamp } from '../utils/timezone';

// Support both browser (import.meta.env) and Node.js (process.env)
// For Cloud Functions build, we only use process.env
const getEnv = (key: string) => {
  return process.env[key];
};

// Get SHEETS_ID dynamically to ensure it picks up environment variables
const getSheetsId = () => getEnv('VITE_GOOGLE_SHEETS_ID');

// Sheet names
export const SHEET_NAMES = {
  RAW_HOURLY: 'orders_raw_hourly',
  ORG_METRICS: 'org_hourly_metrics',
  PERSON_METRICS: 'person_hourly_performance',
  WORKING_DAYS: 'config_working_days',
  DAILY_SUMMARY: 'daily_summary',
  SYNC_LOG: 'config_sync_log',
  PERSON_QUEUES: 'person_level_queues',
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
 * Append order snapshots to raw hourly sheet
 */
export async function appendOrderSnapshots(snapshots: OrderSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getSheetsClient();

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
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.RAW_HOURLY}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`Appended ${rows.length} order snapshots to Google Sheets`);
}

/**
 * Append org metrics
 */
export async function appendOrgMetrics(metrics: OrgMetrics[]): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getSheetsClient();

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
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.ORG_METRICS}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`Appended ${rows.length} org metrics to Google Sheets`);
}

/**
 * Append person metrics
 */
export async function appendPersonMetrics(metrics: PersonMetrics[]): Promise<void> {
  if (metrics.length === 0) return;

  const sheets = getSheetsClient();

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
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.PERSON_METRICS}!A:M`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`Appended ${rows.length} person metrics to Google Sheets`);
}

/**
 * Append or update daily summary (upsert logic)
 * If a row exists for the date+facility, update it. Otherwise, append.
 */
export async function appendOrUpdateDailySummary(summaries: DailySummary[]): Promise<void> {
  if (summaries.length === 0) return;

  const sheets = getSheetsClient();

  // Fetch existing data to check for duplicates
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
        spreadsheetId: getSheetsId(),
        range: `${SHEET_NAMES.DAILY_SUMMARY}!A${existingRowIndex}:Q${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(`Updated daily summary for ${summary.facility_id} on ${summary.created_at_date}`);
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: getSheetsId(),
        range: `${SHEET_NAMES.DAILY_SUMMARY}!A:Q`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });
      console.log(`Appended daily summary for ${summary.facility_id} on ${summary.created_at_date}`);
    }
  }
}

/**
 * Get latest order snapshots for a specific date from orders_raw_hourly sheet
 * Reads raw data and returns latest snapshot for each order
 */
export async function getLatestOrderSnapshots(
  date: string,
  facilityId?: string
): Promise<OrderSnapshot[]> {
  const sheets = getSheetsClient();

  console.log(`Reading orders_raw_hourly for date: ${date}${facilityId ? ` (facility: ${facilityId})` : ''}...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
  console.log(`Found ${result.length} latest order snapshots for ${date}${facilityId ? ` (${facilityId})` : ''}`);

  return result;
}

/**
 * Get latest person metrics for a specific date and facility
 * Returns the most recent snapshot for each provider on the given date
 */
export async function getLatestPersonMetrics(
  date: string,
  facilityId: string
): Promise<PersonMetrics[]> {
  const sheets = getSheetsClient();

  console.log(`Reading person_hourly_performance for date: ${date} (facility: ${facilityId})...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
      person_pace_status: (row[10] as 'AHEAD' | 'ON_PACE' | 'BEHIND') || 'ON_PACE',
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
  console.log(`Found ${result.length} providers with metrics for ${date} (${facilityId})`);

  return result;
}

/**
 * Get person metrics for multiple dates and facilities in bulk
 * Optimized to read the sheet once and filter in memory
 * @param dates Array of dates to fetch (YYYY-MM-DD format)
 * @param facilityIds Array of facility IDs to filter by
 * @returns Map with key "date|facilityId" and value array of PersonMetrics
 */
export async function getPersonMetricsForDateRange(
  dates: string[],
  facilityIds: string[]
): Promise<Map<string, PersonMetrics[]>> {
  const sheets = getSheetsClient();

  // Read entire person_hourly_performance sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
      avg_worked_last_7_working_days: parseFloat(row[colIndices.avg_worked_last_7_working_days] || '0'),
      person_pace_vs_avg: parseFloat(row[colIndices.person_pace_vs_avg] || '0'),
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
 * Get working day configuration
 */
export async function getWorkingDayConfig(date: string): Promise<WorkingDayConfig | null> {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
 * Add or update working day configuration
 */
export async function setWorkingDayConfig(
  date: string,
  isWorkingDay: boolean,
  dayType: string,
  notes: string
): Promise<void> {
  const sheets = getSheetsClient();

  // Check if configuration already exists
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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

  const rowData = [date, isWorkingDay.toString().toUpperCase(), dayType, notes];

  if (existingRowIndex > 0) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetsId(),
      range: `${SHEET_NAMES.WORKING_DAYS}!A${existingRowIndex}:D${existingRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    });
    console.log(`Updated working day config for ${date}`);
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetsId(),
      range: `${SHEET_NAMES.WORKING_DAYS}!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    });
    console.log(`Added working day config for ${date}`);
  }
}

/**
 * Read historical org metrics for pace calculation
 */
export async function getHistoricalOrgMetrics(
  facilityId: string,
  startDate: string,
  endDate: string
): Promise<OrgMetrics[]> {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.ORG_METRICS}!A:K`,
  });

  const rows = response.data.values || [];
  const metrics: OrgMetrics[] = [];

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[3] === facilityId) { // facility_id is column 3 (index 3)
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
 * Create a new sheet tab if it doesn't exist
 */
async function createSheetIfNotExists(sheetName: string): Promise<void> {
  const sheets = getSheetsClient();

  try {
    // Check if sheet exists by getting metadata
    const response = await sheets.spreadsheets.get({
      spreadsheetId: getSheetsId(),
    });

    const sheetExists = response.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName
    );

    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getSheetsId(),
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
 * Create sheets with headers if they don't exist
 */
export async function initializeSheets(): Promise<void> {
  const sheets = getSheetsClient();

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

  // Create or update each sheet with headers
  for (const [sheetName, headerRow] of Object.entries(headers)) {
    try {
      // First, ensure the sheet exists
      await createSheetIfNotExists(sheetName);

      // Then set headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSheetsId(),
        range: `${sheetName}!A1:${String.fromCharCode(65 + headerRow.length - 1)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headerRow],
        },
      });
      console.log(`Initialized sheet: ${sheetName}`);
    } catch (error) {
      console.error(`Error initializing sheet ${sheetName}:`, error);
    }
  }
}

/**
 * Get the latest sync log entry for a facility+date combination
 */
export async function getLastSyncInfo(
  facilityId: string,
  date: string
): Promise<SyncLogEntry | null> {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
  });

  const rows = response.data.values || [];

  if (rows.length <= 1) {
    return null;
  }

  // Find the latest sync for this facility+date
  // Simply use the last matching row since rows are appended chronologically
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
        status: (row[4] as 'in_progress' | 'completed' | 'failed') || 'in_progress',
        error_message: row[5] || undefined,
        records_synced: parseInt(row[6]) || 0,
      };
      break;  // Found the latest (last) matching entry
    }
  }

  return latestEntry;
}

/**
 * Record the start of a sync operation
 */
export async function recordSyncStart(facilityId: string, date: string): Promise<void> {
  const sheets = getSheetsClient();

  const timestamp = toISTTimestamp(new Date());

  const row = [facilityId, date, timestamp, '', 'in_progress', '', 0];

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.SYNC_LOG}!A:G`,
    valueInputOption: 'RAW',  // Use RAW to prevent Sheets from reformatting timestamps
    requestBody: {
      values: [row],
    },
  });

  console.log(`Recorded sync start for ${facilityId} on ${date} at ${timestamp}`);
}

/**
 * Record successful completion of a sync operation
 */
export async function recordSyncComplete(
  facilityId: string,
  date: string,
  recordCount: number
): Promise<void> {
  const sheets = getSheetsClient();

  const timestamp = toISTTimestamp(new Date());

  // Get all rows to find the latest in_progress entry
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
      spreadsheetId: getSheetsId(),
      range: `${SHEET_NAMES.SYNC_LOG}!D${rowIndexToUpdate}:G${rowIndexToUpdate}`,
      valueInputOption: 'RAW',  // Use RAW to prevent Sheets from reformatting timestamps
      requestBody: {
        values: [[timestamp, 'completed', '', recordCount]],
      },
    });
    console.log(`Recorded sync completion for ${facilityId} on ${date} - ${recordCount} records`);
  } else {
    console.warn(`No in_progress sync found to update for ${facilityId} on ${date}`);
  }
}

/**
 * Record failure of a sync operation
 */
export async function recordSyncFailure(
  facilityId: string,
  date: string,
  errorMessage: string
): Promise<void> {
  const sheets = getSheetsClient();

  const timestamp = toISTTimestamp(new Date());

  // Get all rows to find the latest in_progress entry
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
      spreadsheetId: getSheetsId(),
      range: `${SHEET_NAMES.SYNC_LOG}!D${rowIndexToUpdate}:G${rowIndexToUpdate}`,
      valueInputOption: 'RAW',  // Use RAW to prevent Sheets from reformatting timestamps
      requestBody: {
        values: [[timestamp, 'failed', errorMessage, 0]],
      },
    });
    console.log(`Recorded sync failure for ${facilityId} on ${date}: ${errorMessage}`);
  } else {
    console.warn(`No in_progress sync found to update for ${facilityId} on ${date}`);
  }
}

/**
 * Get daily summary rows for a date range and facilities
 * Used by business view to aggregate metrics across multiple days and organizations
 */
export async function getDailySummaryForRange(
  facilityIds: string[],
  startDate: string,
  endDate: string
): Promise<DailySummary[]> {
  const sheets = getSheetsClient();

  console.log(`Fetching daily_summary for ${facilityIds.length} facilities from ${startDate} to ${endDate}...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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

  console.log(`Found ${summaries.length} daily summary rows`);
  return summaries;
}

/**
 * Get working day configs for a date range
 * Used by business view to filter out non-working days when weekend toggle is off
 */
export async function getWorkingDaysInRange(
  startDate: string,
  endDate: string
): Promise<WorkingDayConfig[]> {
  const sheets = getSheetsClient();

  console.log(`Fetching config_working_days from ${startDate} to ${endDate}...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
      is_working_day: row[1] === 'TRUE' || row[1] === true || row[1] === 'true',
      day_type: row[2] || '',
      notes: row[3] || '',
    };

    configs.push(config);
  }

  console.log(`Found ${configs.length} working day config entries`);
  return configs;
}

/**
 * Append person queue snapshots to person_level_queues sheet
 */
export async function appendPersonQueueSnapshots(snapshots: PersonQueueSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;

  const sheets = getSheetsClient();

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
    spreadsheetId: getSheetsId(),
    range: `${SHEET_NAMES.PERSON_QUEUES}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });

  console.log(`Appended ${rows.length} person queue snapshots to Google Sheets`);
}

/**
 * Get latest person queue snapshots from person_level_queues sheet
 * Returns the most recent snapshot for each person
 * @param facilityIds Optional array of facility IDs to filter by
 * @returns Array of latest PersonQueueSnapshot for each person
 */
export async function getLatestPersonQueueSnapshots(
  facilityIds?: string[]
): Promise<PersonQueueSnapshot[]> {
  const sheets = getSheetsClient();

  console.log(`Reading person_level_queues sheet...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetsId(),
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
  console.log(`Found ${result.length} people with queue snapshots`);

  return result;
}
