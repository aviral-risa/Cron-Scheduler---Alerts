import { google } from 'googleapis';
import { getSheetsClient } from '../sheets-dual';

/** Visible + store summary tab columns (keep in sync with upsertAsteraDailySummaryRow). */
export const DAILY_SUMMARY_HEADERS = [
  'Report Date (IST)',
  'Cases Added',
  'Unique Cases (New vs 30d)',
  'Allotted %',
  'Non-Allotted MRNs',
  'Auth by RISA (Current)',
  'NAR (Current)',
  'Auth Pending (Current)',
  'Denials (Current)',
  'Work In Progress (Current)',
  'Query (Current)',
  'First Pass Approval %',
  'Denial Value ($)',
  'Total Processed Value ($)',
  'Last Updated (UTC)',
] as const;

const ASSIGNEE_HEADERS = [
  'Report Date',
  'First Allotted Date',
  'Assignee',
  'Assigned Cases',
  'Follow-up Cases',
  'Auth by RISA',
  'NAR',
  'Denied by RISA',
  'Unworked Cases',
  'Moved to WIP',
  'Unworked MRNs',
  'Denial Value ($)',
  'Total Scan Value ($)',
  'Last Updated',
];

const TAT_HEADERS = [
  'First Worked Date',
  'Assignee',
  'Payer',
  'CPT',
  'MRN',
  'Order ID',
  'Auth Required Started (IST)',
  'First Worked (IST)',
  'TAT Days',
  'Last Updated',
];

const SUMMARY_PCT_COLS = [3, 11];
const SUMMARY_CURRENCY_COLS = [12, 13];
const ASSIGNEE_CURRENCY_COLS = [11, 12];
const TAT_DECIMAL_COLS = [8];

const HEADER_STYLE = {
  backgroundColor: { red: 0.12, green: 0.31, blue: 0.47 },
  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
  horizontalAlignment: 'CENTER',
};

const ALT_ROW_STYLE = {
  backgroundColor: { red: 0.93, green: 0.96, blue: 0.98 },
};

function getSpreadsheetId(): string {
  const id =
    process.env.ASTERA_DASHBOARD_SHEETS_ID ||
    process.env.VITE_ASTERA_DASHBOARD_SHEETS_ID ||
    process.env.DASHBOARD_SHEETS_ID;
  if (!id) {
    throw new Error('Set ASTERA_DASHBOARD_SHEETS_ID in .env');
  }
  return id;
}

export function monthTabName(reportDate: string, suffix: string): string {
  const [year, month] = reportDate.split('-');
  return `${year}-${month}_${suffix}`;
}

export async function readSummaryRowFromTab(
  reportDate: string,
  tabSuffix: 'summary' | 'summary_store'
): Promise<Record<string, string | number> | null> {
  const spreadsheetId = getSpreadsheetId();
  const tab = monthTabName(reportDate, tabSuffix);
  const rows = await readTabRows(spreadsheetId, tab);
  if (rows.length <= 1) {
    return null;
  }
  const header = rows[0];
  for (const row of rows.slice(1)) {
    const rowDate = normalizeSheetDate(row[0]);
    if (rowDate === reportDate) {
      const record: Record<string, string | number> = {};
      header.forEach((key, i) => {
        if (i === 0) {
          record[key] = rowDate ?? reportDate;
        } else {
          record[key] = row[i] ?? '';
        }
      });
      return record;
    }
  }
  return null;
}

function columnLetter(count: number): string {
  let label = '';
  let n = count;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Normalize sheet cell values to YYYY-MM-DD for reliable date matching */
export function normalizeSheetDate(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number' && value > 30000 && value < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, mo, d, y] = mdy;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseAllottedPct(value: unknown): number {
  const n = Number(String(value ?? '').replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

/** IST weekday check — skips Sat/Sun */
export function isWeekendIst(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00+05:30`).getDay();
  return day === 0 || day === 6;
}

/** Persist computed metrics (weekday with cases added) */
export function shouldStoreDashboardDate(casesAdded: number, dateStr: string): boolean {
  if (isWeekendIst(dateStr)) {
    return false;
  }
  return casesAdded > 0;
}

/** Show on user-facing summary / assignees / TAT tabs */
export function shouldDisplayDashboardDate(allottedCasesPct: number, dateStr: string): boolean {
  if (isWeekendIst(dateStr)) {
    return false;
  }
  return allottedCasesPct > 0;
}

/** @deprecated use shouldStoreDashboardDate */
export function shouldSyncDashboardDate(casesAdded: number, dateStr: string): boolean {
  return shouldStoreDashboardDate(casesAdded, dateStr);
}

async function getSheetId(spreadsheetId: string, title: string): Promise<number> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (sheet?.properties?.sheetId == null) {
    throw new Error(`Sheet tab not found: ${title}`);
  }
  return sheet.properties.sheetId;
}

async function ensureTab(
  spreadsheetId: string,
  title: string,
  headers: string[],
  options?: { hidden?: boolean }
): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
                hidden: options?.hidden ?? false,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    if (options?.hidden && !existing.properties?.hidden) {
      const sheetId = existing.properties?.sheetId;
      if (sheetId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ updateSheetProperties: { properties: { sheetId, hidden: true }, fields: 'hidden' } }],
          },
        });
      }
    }
  }
}

async function applyTabFormatting(
  spreadsheetId: string,
  tab: string,
  headerCount: number,
  options: {
    pctCols: number[];
    currencyCols: number[];
    tabColor?: { red: number; green: number; blue: number };
    skipIfFormatted?: boolean;
  }
): Promise<void> {
  if (options.skipIfFormatted) {
    return;
  }
  const sheets = getSheetsClient();
  const sheetId = await getSheetId(spreadsheetId, tab);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:A`,
  });
  const rowCount = Math.max((response.data.values?.length ?? 1), 1);

  const requests: object[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
          ...(options.tabColor ? { tabColor: options.tabColor } : {}),
        },
        fields: options.tabColor
          ? 'gridProperties.frozenRowCount,tabColor'
          : 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headerCount },
        cell: { userEnteredFormat: HEADER_STYLE },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: headerCount },
        },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headerCount },
      },
    },
  ];

  if (rowCount > 1) {
    requests.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: headerCount },
          rowProperties: {
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: ALT_ROW_STYLE.backgroundColor,
          },
        },
      },
    });
  }

  for (const col of options.pctCols) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.0"%"' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }

  for (const col of options.currencyCols) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }

  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already exists')) {
      console.warn(`[Astera Sheets] Formatting warning for ${tab}:`, message);
    }
  }
}

async function upsertRowByDate(
  spreadsheetId: string,
  tab: string,
  reportDate: string,
  row: (string | number)[]
): Promise<void> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:A`,
  });
  const rows = response.data.values ?? [];
  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (normalizeSheetDate(rows[i][0]) === reportDate) {
      targetRow = i + 1;
      break;
    }
  }

  const endCol = columnLetter(row.length);
  if (targetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A${targetRow}:${endCol}${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:${endCol}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  }
}

async function replaceRowsForDate(
  spreadsheetId: string,
  tab: string,
  reportDate: string,
  newRows: (string | number)[][],
  defaultHeader: string[]
): Promise<void> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:Z`,
  });
  const all = response.data.values ?? [];
  const header = all[0] ?? defaultHeader;
  const kept = [header, ...all.slice(1).filter((r) => normalizeSheetDate(r[0]) !== reportDate)];
  const combined = [...kept, ...newRows];

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: combined },
  });
}

async function removeDateFromTab(spreadsheetId: string, tab: string, reportDate: string): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (!meta.data.sheets?.some((s) => s.properties?.title === tab)) {
    return;
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:Z`,
  });
  const all = response.data.values ?? [];
  if (all.length <= 1) {
    return;
  }

  const header = all[0];
  const kept = [header, ...all.slice(1).filter((r) => normalizeSheetDate(r[0]) !== reportDate)];
  if (kept.length === all.length) {
    return;
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: kept },
  });
}

async function readTabRows(spreadsheetId: string, tab: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (!meta.data.sheets?.some((s) => s.properties?.title === tab)) {
    return [];
  }
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:Z`,
  });
  return response.data.values ?? [];
}

function displayDatesFromStoreSummary(storeRows: string[][]): Set<string> {
  const dates = new Set<string>();
  for (const row of storeRows.slice(1)) {
    const date = normalizeSheetDate(row[0]);
    if (!date) {
      continue;
    }
    if (shouldDisplayDashboardDate(parseAllottedPct(row[3]), date)) {
      dates.add(date);
    }
  }
  return dates;
}

function monthAnchorFromDate(reportDate: string): string {
  const [year, month] = reportDate.split('-');
  return `${year}-${month}-15`;
}

/** Unique YYYY-MM-15 anchors for every calendar month touched by [startDate, endDate]. */
export function monthAnchorsBetween(startDate: string, endDate: string): string[] {
  const anchors = new Set<string>();
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    anchors.add(`${y}-${String(m).padStart(2, '0')}-15`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return [...anchors].sort();
}

/** Rebuild visible tabs from store for each month in range (backfill / rolling sync). */
export async function publishVisibleDashboardMonthsInRange(
  startDate: string,
  endDate: string,
  options?: { skipFormatting?: boolean }
): Promise<void> {
  for (const anchor of monthAnchorsBetween(startDate, endDate)) {
    await publishVisibleDashboardMonth(anchor);
    if (!options?.skipFormatting) {
      await formatAsteraDashboardMonth(anchor);
    }
  }
}

/** Rebuild visible tabs from hidden store tabs (allotted % > 0 only) */
export async function publishVisibleDashboardMonth(reportDate: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  const storeSummary = monthTabName(reportDate, 'summary_store');
  const storeAssignees = monthTabName(reportDate, 'assignees_store');
  const storeTat = monthTabName(reportDate, 'tat_store');
  const visibleSummary = monthTabName(reportDate, 'summary');
  const visibleAssignees = monthTabName(reportDate, 'assignees');
  const visibleTat = monthTabName(reportDate, 'tat');

  const summaryStoreRows = await readTabRows(spreadsheetId, storeSummary);
  if (summaryStoreRows.length <= 1) {
    return;
  }

  const displayDates = displayDatesFromStoreSummary(summaryStoreRows);
  const header = summaryStoreRows[0];

  await ensureTab(spreadsheetId, visibleSummary, DAILY_SUMMARY_HEADERS);
  const visibleSummaryRows = [
    header,
    ...summaryStoreRows.slice(1).filter((row) => {
      const d = normalizeSheetDate(row[0]);
      return d != null && displayDates.has(d);
    }),
  ];
  await getSheetsClient().spreadsheets.values.clear({
    spreadsheetId,
    range: `${visibleSummary}!A:${columnLetter(DAILY_SUMMARY_HEADERS.length)}`,
  });
  await getSheetsClient().spreadsheets.values.update({
    spreadsheetId,
    range: `${visibleSummary}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: visibleSummaryRows },
  });

  const assigneeStoreRows = await readTabRows(spreadsheetId, storeAssignees);
  await ensureTab(spreadsheetId, visibleAssignees, ASSIGNEE_HEADERS);
  const assigneeHeader = assigneeStoreRows[0] ?? ASSIGNEE_HEADERS;
  const visibleAssigneeRows = [
    assigneeHeader,
    ...assigneeStoreRows.slice(1).filter((row) => {
      const d = normalizeSheetDate(row[0]);
      return d != null && displayDates.has(d);
    }),
  ];
  await getSheetsClient().spreadsheets.values.clear({ spreadsheetId, range: `${visibleAssignees}!A:N` });
  await getSheetsClient().spreadsheets.values.update({
    spreadsheetId,
    range: `${visibleAssignees}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: visibleAssigneeRows },
  });

  const tatStoreRows = await readTabRows(spreadsheetId, storeTat);
  if (tatStoreRows.length > 0) {
    await ensureTab(spreadsheetId, visibleTat, TAT_HEADERS);
    const tatHeader = tatStoreRows[0] ?? TAT_HEADERS;
    const visibleTatRows = [
      tatHeader,
      ...tatStoreRows.slice(1).filter((row) => {
        const d = normalizeSheetDate(row[0]);
        return d != null && displayDates.has(d);
      }),
    ];
    await getSheetsClient().spreadsheets.values.clear({ spreadsheetId, range: `${visibleTat}!A:J` });
    await getSheetsClient().spreadsheets.values.update({
      spreadsheetId,
      range: `${visibleTat}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: visibleTatRows },
    });
  }

  await applyTabFormatting(spreadsheetId, visibleSummary, DAILY_SUMMARY_HEADERS.length, {
    pctCols: SUMMARY_PCT_COLS,
    currencyCols: SUMMARY_CURRENCY_COLS,
    tabColor: { red: 0.2, green: 0.45, blue: 0.75 },
  });
  await applyTabFormatting(spreadsheetId, visibleAssignees, ASSIGNEE_HEADERS.length, {
    pctCols: [],
    currencyCols: ASSIGNEE_CURRENCY_COLS,
    tabColor: { red: 0.55, green: 0.35, blue: 0.75 },
  });
  const meta = await getSheetsClient().spreadsheets.get({ spreadsheetId });
  if (meta.data.sheets?.some((s) => s.properties?.title === visibleTat)) {
    await applyTabFormatting(spreadsheetId, visibleTat, TAT_HEADERS.length, {
      pctCols: [],
      currencyCols: [],
      tabColor: { red: 0.2, green: 0.6, blue: 0.45 },
    });
  }
}

async function removeDashboardDateFromVisible(reportDate: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  for (const tab of [
    monthTabName(reportDate, 'summary'),
    monthTabName(reportDate, 'assignees'),
    monthTabName(reportDate, 'tat'),
  ]) {
    await removeDateFromTab(spreadsheetId, tab, reportDate);
  }
}

export async function upsertAsteraDailySummaryRow(
  reportDate: string,
  data: {
    cases_added: number;
    unique_cases_added: number;
    allotted_cases_pct: number;
    non_allotted_mrns: string | null;
    auth_by_risa_count: number;
    nar_count: number;
    auth_pending_count: number;
    denial_count: number;
    wip_count: number;
    query_count: number;
    first_pass_approval_rate_pct: number;
    denial_value_usd: number;
    total_scans_value_usd: number;
  },
  options?: { skipFormatting?: boolean; skipPublish?: boolean }
): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  const storeTab = monthTabName(reportDate, 'summary_store');
  await ensureTab(spreadsheetId, storeTab, DAILY_SUMMARY_HEADERS, { hidden: true });

  const row = [
    reportDate,
    data.cases_added,
    data.unique_cases_added,
    data.allotted_cases_pct,
    data.non_allotted_mrns ?? '',
    data.auth_by_risa_count,
    data.nar_count,
    data.auth_pending_count,
    data.denial_count,
    data.wip_count,
    data.query_count,
    data.first_pass_approval_rate_pct,
    data.denial_value_usd,
    data.total_scans_value_usd,
    new Date().toISOString(),
  ];

  await upsertRowByDate(spreadsheetId, storeTab, reportDate, row);

  if (!options?.skipPublish) {
    await publishVisibleDashboardMonth(reportDate);
  }
}

export async function upsertAsteraAssigneeRows(
  reportDate: string,
  rows: Array<{
    first_allotted_date: string | null;
    assignee: string;
    assigned_cases: number;
    followup_cases: number;
    auth_by_risa_count: number;
    nar_count: number;
    denied_by_risa_count: number;
    unworked_cases_count: number;
    moved_to_wip_count: number;
    unworked_mrns: string | null;
    denial_value_usd: number;
    total_scans_value_usd: number;
  }>,
  options?: { skipFormatting?: boolean; skipPublish?: boolean }
): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  const storeTab = monthTabName(reportDate, 'assignees_store');
  await ensureTab(spreadsheetId, storeTab, ASSIGNEE_HEADERS, { hidden: true });

  const sheetRows = rows.map((r) => [
    reportDate,
    r.first_allotted_date ?? '',
    r.assignee,
    r.assigned_cases,
    r.followup_cases,
    r.auth_by_risa_count,
    r.nar_count,
    r.denied_by_risa_count,
    r.unworked_cases_count,
    r.moved_to_wip_count,
    r.unworked_mrns ?? '',
    r.denial_value_usd,
    r.total_scans_value_usd,
    new Date().toISOString(),
  ]);

  await replaceRowsForDate(spreadsheetId, storeTab, reportDate, sheetRows, ASSIGNEE_HEADERS);

  if (!options?.skipPublish) {
    await publishVisibleDashboardMonth(reportDate);
  }
}

export async function upsertAsteraTatRows(
  reportDate: string,
  rows: Array<{
    assignee: string;
    payer: string;
    cpt: string;
    mrn: string;
    order_id: string;
    auth_required_started_ist: string;
    first_worked_ist: string;
    tat_days: number;
  }>,
  options?: { skipFormatting?: boolean; skipPublish?: boolean }
): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  const storeTab = monthTabName(reportDate, 'tat_store');
  await ensureTab(spreadsheetId, storeTab, TAT_HEADERS, { hidden: true });

  const sheetRows = rows.map((r) => [
    reportDate,
    r.assignee,
    r.payer,
    r.cpt,
    r.mrn,
    r.order_id,
    r.auth_required_started_ist,
    r.first_worked_ist,
    r.tat_days,
    new Date().toISOString(),
  ]);

  await replaceRowsForDate(spreadsheetId, storeTab, reportDate, sheetRows, TAT_HEADERS);

  if (!options?.skipPublish) {
    await publishVisibleDashboardMonth(reportDate);
  }
}

export async function formatAsteraDashboardMonth(reportDate: string): Promise<void> {
  await publishVisibleDashboardMonth(reportDate);
}

export async function pruneAsteraDashboardMonth(reportDate: string): Promise<void> {
  await publishVisibleDashboardMonth(reportDate);
}

export async function removeDashboardDateFromSheets(reportDate: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  for (const suffix of ['summary_store', 'assignees_store', 'tat_store', 'summary', 'assignees', 'tat']) {
    await removeDateFromTab(spreadsheetId, monthTabName(reportDate, suffix), reportDate);
  }
}

export { getSpreadsheetId as getAsteraDashboardSpreadsheetId, removeDashboardDateFromVisible };
