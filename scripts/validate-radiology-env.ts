import dotenv from 'dotenv';
import {
  getCredentialClientEmail,
  getCredentialSource,
  queryBigQuery,
} from '../src/services/bigquery';

dotenv.config({ override: true });

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

const required: Array<{ label: string; value: string | undefined }> = [
  { label: 'SLACK_BOT_TOKEN', value: process.env.SLACK_BOT_TOKEN },
  {
    label: 'SLACK_CHANNEL_TEST_ALERTS',
    value: firstEnv('SLACK_CHANNEL_TEST_ALERTS', 'SLACK_CHANNEL'),
  },
  {
    label: 'SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL',
    value: firstEnv(
      'SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL',
      'SLACK_CHANNEL_ASTERA_RADIOLOGY_GROUP'
    ),
  },
  {
    label: 'ASTERA_DASHBOARD_SHEETS_ID (or VITE_DASHBOARD_SHEETS_ID)',
    value: firstEnv(
      'ASTERA_DASHBOARD_SHEETS_ID',
      'VITE_ASTERA_DASHBOARD_SHEETS_ID',
      'VITE_DASHBOARD_SHEETS_ID',
      'DASHBOARD_SHEETS_ID',
      'DASHBOARD_SPREADSHEET_ID'
    ),
  },
];

const missing = required.filter((r) => !r.value).map((r) => r.label);

if (missing.length > 0) {
  console.error('❌ Radiology cron env validation failed. Missing:');
  for (const item of missing) {
    console.error(`   • ${item}`);
  }
  console.error(
    '\nAdd these to RADIOLOGY_ENV_FILE or ensure DASHBOARD_ENV_FILE is merged in the workflow.'
  );
  process.exit(1);
}

console.log('✓ Radiology env validation passed');

async function runBigQuerySmokeTest(): Promise<void> {
  const hasExplicitCreds =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.BIGQUERY_KEY_FILE?.trim();

  if (!hasExplicitCreds) {
    console.log('ℹ Skipping BigQuery smoke test (no GOOGLE_APPLICATION_CREDENTIALS or BIGQUERY_KEY_FILE)');
    return;
  }

  try {
    const rows = await queryBigQuery<{ ok: number }>('SELECT 1 AS ok');
    const source = getCredentialSource();
    const clientEmail = getCredentialClientEmail();
    const identity = clientEmail ? `${source} (${clientEmail})` : source;
    console.log(`✓ BigQuery smoke test passed via ${identity} — result: ${rows[0]?.ok ?? 'unknown'}`);
  } catch (err) {
    console.error('❌ BigQuery smoke test failed:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runBigQuerySmokeTest().catch((err) => {
  console.error('❌ BigQuery smoke test failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
