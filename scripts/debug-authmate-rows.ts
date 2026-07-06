import dotenv from 'dotenv';
dotenv.config({ override: true });
import { runBqAlertQuery } from '../src/alerts/utils/bq-query-loader';
import {
  ASTERA_BQ_SQL_FILES,
  ASTERA_RADIOLOGY_ORG_ID,
} from '../src/alerts/config/astera-bq-alerts.config';

async function main() {
  const date = process.argv[2] ?? '2026-07-02';
  const rows = await runBqAlertQuery<{
    mrn: string;
    missed_day_count: number;
    assigned_to: string;
    pending_since: string;
  }>(ASTERA_BQ_SQL_FILES.authmatePendingMissedNotes, {
    report_date: date,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });
  console.log(`Rows: ${rows.length}`);
  for (const r of rows) {
    console.log(`${r.mrn} | ${r.missed_day_count} followups | ${r.assigned_to} | since ${r.pending_since}`);
  }
  const excluded = ['2606100017', '2605220045'];
  for (const m of excluded) {
    console.log(`${m} in results: ${rows.some((r) => r.mrn === m)}`);
  }
}

main().catch(console.error);
