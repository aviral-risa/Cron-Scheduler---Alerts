import dotenv from 'dotenv';
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
