import 'dotenv/config';
import { runBqAlertQuery } from '../src/alerts/utils/bq-query-loader';
import { ASTERA_BQ_SQL_FILES, ASTERA_RADIOLOGY_ORG_ID } from '../src/alerts/config/astera-bq-alerts.config';
import { queryBigQuery } from '../src/services/bigquery';

const date = process.argv[2] ?? '2026-07-02';

async function main(): Promise<void> {
  const [summary] = await runBqAlertQuery<Record<string, unknown>>(
    ASTERA_BQ_SQL_FILES.dailySummaryMetrics,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );

  console.log(`\nSummary metrics for ${date}:`);
  console.log(JSON.stringify(summary, null, 2));

  const breakdown = await queryBigQuery<{ auth_status: string; cnt: number }>(
    `
    WITH latest_order AS (
      SELECT * EXCEPT (_cdc_rank, _change_type)
      FROM (
        SELECT t.*, datastream_metadata.change_type AS _change_type,
          ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY datastream_metadata.source_timestamp DESC,
            datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
        FROM \`prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order\` AS t
        WHERE t.org_id = @org_id
      )
      WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
    ),
    latest_status AS (
      SELECT * EXCEPT (_cdc_rank, _change_type)
      FROM (
        SELECT t.*, datastream_metadata.change_type AS _change_type,
          ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY datastream_metadata.source_timestamp DESC,
            datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
        FROM \`prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status\` AS t
        WHERE t.org_id = @org_id
      )
      WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
    )
    SELECT
      LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS auth_status,
      COUNT(*) AS cnt
    FROM latest_order o
    LEFT JOIN latest_status s ON s.order_id = o.order_id
    WHERE DATE(o.created_at, 'Asia/Kolkata') = @report_date
    GROUP BY 1
    ORDER BY cnt DESC
    `,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );

  console.log('\nStatus breakdown (cohort, current status):');
  for (const r of breakdown) {
    console.log(`  ${r.auth_status || '(empty)'}: ${r.cnt}`);
  }

  const map = Object.fromEntries(breakdown.map((r) => [r.auth_status, Number(r.cnt)]));
  const checks = [
    ['auth_by_risa', summary?.auth_by_risa_count, map.auth_by_risa ?? 0],
    ['nar', summary?.nar_count, map.no_auth_required ?? 0],
    ['pending', summary?.auth_pending_count, map.pending ?? 0],
    ['wip', summary?.wip_count, map.work_in_progress ?? 0],
    ['query', summary?.query_count, map.query ?? 0],
  ];
  console.log('\nVerification:');
  let ok = true;
  for (const [label, got, expected] of checks) {
    const match = Number(got) === Number(expected);
    if (!match) ok = false;
    console.log(`  ${match ? '✓' : '✗'} ${label}: summary=${got} breakdown=${expected}`);
  }
  console.log(ok ? '\n✓ All counts match breakdown\n' : '\n✗ Mismatch detected\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
