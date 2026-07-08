/**
 * Sync one date, then compare every summary column: BigQuery expected vs Google Sheet (store + visible).
 *
 * Usage: npx tsx scripts/verify-summary-sheet.ts 2026-07-02
 */
import 'dotenv/config';
import { runBqAlertQuery } from '../src/alerts/utils/bq-query-loader';
import { ASTERA_BQ_SQL_FILES, ASTERA_RADIOLOGY_ORG_ID } from '../src/alerts/config/astera-bq-alerts.config';
import { scanValueFromRegimen } from '../src/alerts/utils/scan-value';

function sumScanValues(
  rows: Array<{ row_type: string; regimen_name: string | null }>,
  types: string[]
): number {
  return rows
    .filter((r) => types.includes(r.row_type))
    .reduce((sum, r) => sum + scanValueFromRegimen(r.regimen_name), 0);
}
import { syncAsteraDashboardToSheets } from '../src/alerts/bq/astera-dashboard-sync';
import {
  DAILY_SUMMARY_HEADERS,
  readSummaryRowFromTab,
  publishVisibleDashboardMonth,
} from '../src/services/sheets/astera-dashboard-sheets';

const TEST_DATE = process.argv[2] ?? '2026-07-02';

interface DailySummaryRow {
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
}

interface ScanValueRow {
  row_type: string;
  regimen_name: string | null;
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

async function expectedFromBq(date: string) {
  const [summaryRows, cohortScanRows] = await Promise.all([
    runBqAlertQuery<DailySummaryRow>(ASTERA_BQ_SQL_FILES.dailySummaryMetrics, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
    runBqAlertQuery<ScanValueRow>(ASTERA_BQ_SQL_FILES.summaryCohortScanValue, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
  ]);
  const s = summaryRows[0];
  if (!s) throw new Error(`No BQ summary for ${date}`);

  const denialValue = sumScanValues(cohortScanRows, ['denial', 'denied_by_risa']);
  const totalValue = sumScanValues(cohortScanRows, ['auth_by_risa', 'nar', 'denial', 'denied_by_risa']);

  return {
    [DAILY_SUMMARY_HEADERS[0]]: date,
    [DAILY_SUMMARY_HEADERS[1]]: Number(s.cases_added ?? 0),
    [DAILY_SUMMARY_HEADERS[2]]: Number(s.unique_cases_added ?? 0),
    [DAILY_SUMMARY_HEADERS[3]]: Number(s.allotted_cases_pct ?? 0),
    [DAILY_SUMMARY_HEADERS[4]]: str(s.non_allotted_mrns),
    [DAILY_SUMMARY_HEADERS[5]]: Number(s.auth_by_risa_count ?? 0),
    [DAILY_SUMMARY_HEADERS[6]]: Number(s.nar_count ?? 0),
    [DAILY_SUMMARY_HEADERS[7]]: Number(s.auth_pending_count ?? 0),
    [DAILY_SUMMARY_HEADERS[8]]: Number(s.denial_count ?? 0),
    [DAILY_SUMMARY_HEADERS[9]]: Number(s.wip_count ?? 0),
    [DAILY_SUMMARY_HEADERS[10]]: Number(s.query_count ?? 0),
    [DAILY_SUMMARY_HEADERS[11]]: Number(s.first_pass_approval_rate_pct ?? 0),
    [DAILY_SUMMARY_HEADERS[12]]: denialValue,
    [DAILY_SUMMARY_HEADERS[13]]: totalValue,
  };
}

function compareField(
  header: string,
  expected: string | number,
  actual: string | number | undefined,
  numeric = true
): boolean {
  if (!numeric) {
    const ok = str(actual) === str(expected);
    console.log(`  ${ok ? '✓' : '✗'} ${header}: sheet="${actual}" expected="${expected}"`);
    return ok;
  }
  const ok = num(actual) === num(expected);
  console.log(`  ${ok ? '✓' : '✗'} ${header}: sheet=${num(actual)} expected=${num(expected)}`);
  return ok;
}

async function verifyTab(
  label: string,
  date: string,
  expected: Record<string, string | number>,
  suffix: 'summary_store' | 'summary'
): Promise<boolean> {
  const row = await readSummaryRowFromTab(date, suffix);
  if (!row) {
    console.log(`\n✗ ${label}: no row for ${date}`);
    return false;
  }
  console.log(`\n${label} (${suffix}):`);
  let ok = true;
  for (let i = 0; i < DAILY_SUMMARY_HEADERS.length - 1; i++) {
    const h = DAILY_SUMMARY_HEADERS[i];
    const numeric = i !== 0 && i !== 4;
    if (!compareField(h, expected[h], row[h], numeric)) ok = false;
  }
  if (row[DAILY_SUMMARY_HEADERS[14]]) {
    console.log(`  · ${DAILY_SUMMARY_HEADERS[14]}: ${row[DAILY_SUMMARY_HEADERS[14]]}`);
  }
  return ok;
}

async function main(): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary sheet verification — ${TEST_DATE}`);
  console.log('='.repeat(60));

  const expected = await expectedFromBq(TEST_DATE);
  console.log('\nExpected (BigQuery):');
  for (const h of DAILY_SUMMARY_HEADERS.slice(0, -1)) {
    console.log(`  ${h}: ${expected[h]}`);
  }

  console.log('\nSyncing to Sheets...');
  await syncAsteraDashboardToSheets(TEST_DATE, { skipFormatting: true });
  await publishVisibleDashboardMonth(TEST_DATE);

  const storeOk = await verifyTab('Store tab', TEST_DATE, expected, 'summary_store');
  const visibleOk = await verifyTab('Visible tab', TEST_DATE, expected, 'summary');

  console.log('\n' + '='.repeat(60));
  if (storeOk && visibleOk) {
    console.log('✓ All summary values match BigQuery on store + visible tabs\n');
  } else {
    console.log('✗ Mismatch — see details above\n');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
