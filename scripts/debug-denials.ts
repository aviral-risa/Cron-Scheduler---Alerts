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
    order_id: string;
    cpt_code: string;
    denial_date: string;
    denial_preview: string;
  }>(ASTERA_BQ_SQL_FILES.denialInternal, {
    report_date: date,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(console.error);
