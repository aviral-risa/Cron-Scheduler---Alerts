/**
 * Lead Analyst audit: compare BQ summary metrics vs Google Sheets store for July dates.
 * Posts neutral benchmark report to test_alerts.
 *
 * Usage: npx tsx scripts/july-audit-report.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { sendTestAlertsMessage } from '../src/scheduler-jobs';
import { ASTERA_RADIOLOGY_ORG_ID } from '../src/alerts/config/astera-bq-alerts.config';
import {
  getAsteraDashboardSpreadsheetId,
} from '../src/services/sheets/astera-dashboard-sheets';

const SAMPLE_DATES = ['2026-07-01', '2026-07-02', '2026-07-07', '2026-07-08'];

async function queryBq(date: string) {
  const sqlPath = resolve(
    process.cwd(),
    'sql/bigquery/astera-daily-summary-metrics-v1.sql'
  );
  const sql = readFileSync(sqlPath, 'utf8');
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT;
  const bq = new BigQuery(projectId ? { projectId } : undefined);
  const [rows] = await bq.query({
    query: sql,
    params: { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID },
  });
  return rows[0] as Record<string, unknown> | undefined;
}

async function readSheetRow(date: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getAsteraDashboardSpreadsheetId();
  const tab = '2026-07_summary_store';
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:N`,
  });
  const rows = res.data.values ?? [];
  const header = rows[0] ?? [];
  const dateIdx = header.indexOf('Report Date (IST)');
  const casesIdx = header.indexOf('Cases Added');
  const uniqueIdx = header.indexOf('Unique Cases (New vs 30d)');
  if (dateIdx < 0) return null;
  const dataRow = rows.find((r, i) => i > 0 && r[dateIdx] === date);
  if (!dataRow) return null;
  return {
    cases_added: Number(dataRow[casesIdx] ?? 0),
    unique_cases_added: Number(dataRow[uniqueIdx] ?? 0),
  };
}

async function main(): Promise<void> {
  const lines: string[] = [
    `*July 2026 Dashboard Audit* (${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`,
    '_Neutral BQ vs Sheet store comparison (post-sync)_',
    '',
  ];

  let allMatch = true;
  for (const date of SAMPLE_DATES) {
    const bq = await queryBq(date);
    const sheet = await readSheetRow(date);
    if (!bq) {
      lines.push(`• *${date}*: BQ no data`);
      continue;
    }
    const bqCases = Number(bq.cases_added ?? 0);
    const bqUnique = Number(bq.unique_cases_added ?? 0);
    if (!sheet) {
      lines.push(`• *${date}*: BQ ${bqCases}/${bqUnique} — sheet row missing`);
      allMatch = false;
      continue;
    }
    const casesOk = sheet.cases_added === bqCases;
    const uniqueOk = sheet.unique_cases_added === bqUnique;
    if (!casesOk || !uniqueOk) allMatch = false;
    lines.push(
      `• *${date}*: BQ ${bqCases}/${bqUnique} | Sheet ${sheet.cases_added}/${sheet.unique_cases_added} | cases ${casesOk ? '✓' : '✗'} unique ${uniqueOk ? '✓' : '✗'}`
    );
  }

  lines.push('');
  lines.push(
    allMatch
      ? '✅ All sampled dates match BQ (cases + 30d unique).'
      : '⚠️ Mismatches remain — check rolling sync or V3 SQL deployment.'
  );
  lines.push('');
  lines.push(
    '_August tabs_: auto-create when first August data syncs + rolling window includes Aug (3 visible + 3 store).'
  );

  const text = lines.join('\n');
  console.log(text);
  await sendTestAlertsMessage(text);
  console.log('\n✓ Posted audit to test_alerts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
