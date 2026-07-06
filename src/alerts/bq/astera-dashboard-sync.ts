import dotenv from 'dotenv';
dotenv.config({ override: true });
import { runBqAlertQuery } from '../utils/bq-query-loader';
import { getPriorIstReportDate } from '../utils/report-dates';
import {
  ASTERA_RADIOLOGY_ORG_ID,
  ASTERA_BQ_SQL_FILES,
} from '../config/astera-bq-alerts.config';
import { scanValueFromRegimen } from '../utils/scan-value';
import {
  upsertAsteraAssigneeRows,
  upsertAsteraDailySummaryRow,
  upsertAsteraTatRows,
  removeDashboardDateFromSheets,
  shouldStoreDashboardDate,
  isWeekendIst,
  publishVisibleDashboardMonth,
  formatAsteraDashboardMonth,
} from '../../services/sheets/astera-dashboard-sheets';

interface DailySummaryRow {
  report_date: string;
  cases_added: number;
  unique_cases_added: number;
  allotted_cases_pct: number;
  non_allotted_mrns: string | null;
  auth_by_risa_count: number;
  nar_count: number;
  auth_pending_count: number;
  denial_count: number;
  first_pass_approval_rate_pct: number;
}

interface AssigneeRow {
  assignee: string;
  first_allotted_date: string | null;
  assigned_cases: number;
  followup_cases: number;
  auth_by_risa_count: number;
  nar_count: number;
  denied_by_risa_count: number;
  unworked_cases_count: number;
  moved_to_wip_count: number;
  unworked_mrns: string | null;
}

interface ScanValueRow {
  row_type: string;
  regimen_name: string | null;
  assignee: string | null;
}

interface TatRow {
  assignee: string;
  payer: string;
  cpt: string;
  mrn: string;
  order_id: string;
  episode_started_ist: string;
  first_worked_ist: string;
  tat_days: number;
}

function sumScanValues(rows: ScanValueRow[], types: string[]): number {
  return rows
    .filter((r) => types.includes(r.row_type))
    .reduce((sum, r) => sum + scanValueFromRegimen(r.regimen_name), 0);
}

function assigneeScanValues(
  rows: ScanValueRow[],
  assignee: string
): { denial: number; total: number } {
  const mine = rows.filter(
    (r) => r.assignee && r.assignee.toLowerCase() === assignee.toLowerCase()
  );
  return {
    denial: sumScanValues(mine, ['denial', 'denied_by_risa']),
    total: sumScanValues(mine, ['auth_by_risa', 'nar', 'denial', 'denied_by_risa']),
  };
}

function istWeekdaysBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00+05:30`);
  const last = new Date(`${end}T12:00:00+05:30`);
  while (cursor <= last) {
    const iso = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (!isWeekendIst(iso)) {
      dates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export async function syncAsteraDashboardToSheets(
  reportDate?: string,
  options?: { skipFormatting?: boolean; skipPublish?: boolean }
): Promise<void> {
  const date = reportDate ?? getPriorIstReportDate();
  console.log(`\n📊 Astera dashboard sync for ${date}...`);

  const [summaryRows, assigneeRows, scanRows, tatRows] = await Promise.all([
    runBqAlertQuery<DailySummaryRow>(ASTERA_BQ_SQL_FILES.dailySummaryMetrics, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
    runBqAlertQuery<AssigneeRow>(ASTERA_BQ_SQL_FILES.assigneeViewMetrics, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
    runBqAlertQuery<ScanValueRow>(ASTERA_BQ_SQL_FILES.scanValueRows, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
    runBqAlertQuery<TatRow>(ASTERA_BQ_SQL_FILES.assigneeTat, {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }),
  ]);

  const summary = summaryRows[0];
  if (!summary) {
    throw new Error(`No daily summary row for ${date}`);
  }

  const denialValue = sumScanValues(scanRows, ['denial', 'denied_by_risa']);
  const totalValue = sumScanValues(scanRows, ['auth_by_risa', 'nar', 'denial', 'denied_by_risa']);
  const casesAdded = Number(summary.cases_added ?? 0);

  if (!shouldStoreDashboardDate(casesAdded, date)) {
    await removeDashboardDateFromSheets(date);
    const reason = isWeekendIst(date) ? 'weekend' : 'no cases added';
    console.log(`ℹ️ Skipping dashboard sync for ${date} — ${reason}`);
    return;
  }

  const storeOnly = { skipPublish: true };

  await upsertAsteraDailySummaryRow(
    date,
    {
      cases_added: casesAdded,
      unique_cases_added: Number(summary.unique_cases_added ?? 0),
      allotted_cases_pct: Number(summary.allotted_cases_pct ?? 0),
      non_allotted_mrns: summary.non_allotted_mrns,
      auth_by_risa_count: Number(summary.auth_by_risa_count ?? 0),
      nar_count: Number(summary.nar_count ?? 0),
      auth_pending_count: Number(summary.auth_pending_count ?? 0),
      denial_count: Number(summary.denial_count ?? 0),
      first_pass_approval_rate_pct: Number(summary.first_pass_approval_rate_pct ?? 0),
      denial_value_usd: denialValue,
      total_scans_value_usd: totalValue,
    },
    storeOnly
  );

  await upsertAsteraAssigneeRows(
    date,
    assigneeRows.map((r) => {
      const sv = assigneeScanValues(scanRows, r.assignee);
      return {
        ...r,
        denial_value_usd: sv.denial,
        total_scans_value_usd: sv.total,
      };
    }),
    storeOnly
  );

  await upsertAsteraTatRows(
    date,
    tatRows.map((r) => ({
      assignee: r.assignee ?? 'Unknown',
      payer: r.payer ?? 'Unknown',
      cpt: r.cpt ?? 'Unknown',
      mrn: String(r.mrn ?? ''),
      order_id: r.order_id,
      auth_required_started_ist: r.episode_started_ist,
      first_worked_ist: r.first_worked_ist,
      tat_days: Number(r.tat_days ?? 0),
    })),
    storeOnly
  );

  if (!options?.skipPublish) {
    await publishVisibleDashboardMonth(date);
  }

  console.log(
    `✓ Dashboard synced to Sheets for ${date} (denial $${denialValue}, processed $${totalValue}, TAT rows ${tatRows.length})`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function backfillAsteraDashboard(startDate: string, endDate: string): Promise<void> {
  const dates = istWeekdaysBetween(startDate, endDate);
  console.log(`\n📊 Backfilling Astera dashboard for ${dates.length} IST weekday(s): ${startDate} → ${endDate}`);

  const sheetOptions = { skipFormatting: true, skipPublish: true };
  const failures: string[] = [];
  for (const date of dates) {
    try {
      await syncAsteraDashboardToSheets(date, sheetOptions);
      await sleep(4000);
    } catch (error) {
      failures.push(`${date}: ${error}`);
      console.error(`❌ Backfill failed for ${date}:`, error);
      await sleep(8000);
    }
  }

  if (dates.length > 0) {
    await publishVisibleDashboardMonth(endDate);
    await formatAsteraDashboardMonth(endDate);
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

async function main(): Promise<void> {
  const dateArg = process.argv[2];
  if (dateArg === 'prune') {
    const monthAnchor = process.argv[3] ?? getPriorIstReportDate();
    await publishVisibleDashboardMonth(monthAnchor);
    console.log(`✓ Published visible dashboard for month of ${monthAnchor}`);
    return;
  }
  if (dateArg === 'backfill') {
    const start = process.argv[3];
    const end = process.argv[4] ?? start;
    if (!start) {
      throw new Error('Usage: backfill YYYY-MM-DD [YYYY-MM-DD]');
    }
    await backfillAsteraDashboard(start, end);
    return;
  }
  await syncAsteraDashboardToSheets(dateArg);
}

const isDirect = process.argv[1]?.includes('astera-dashboard-sync');
if (isDirect) {
  main()
    .then(() => console.log('\n✓ Astera dashboard sync completed'))
    .catch((err) => {
      console.error('\n❌ Astera dashboard sync failed:', err);
      process.exit(1);
    });
}
