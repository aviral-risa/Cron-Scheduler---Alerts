/**
 * Initialize RPA Metrics Google Sheets
 *
 * This script creates the necessary sheet tabs with headers
 * for the RPA Metrics tracking system.
 *
 * Run: npx tsx src/scripts/init-rpa-sheets.ts
 */

import * as dotenv from 'dotenv';
import { initializeTechMetricsSheets } from '../services/sheets/techMetricsSheets';

// Load environment variables from .env file
dotenv.config();

async function main() {
  console.log('='.repeat(60));
  console.log('RPA Metrics Sheets Initialization');
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('Initializing RPA Metrics sheets...');
    console.log('Sheet ID:', process.env.VITE_TECH_METRICS_SHEETS_ID);
    console.log('');

    await initializeTechMetricsSheets();

    console.log('');
    console.log('✅ SUCCESS!');
    console.log('');
    console.log('Tech Metrics sheets have been initialized with the following tabs:');
    console.log('  1. ev_raw_snapshots - Raw EV data from Algolia');
    console.log('  2. ev_sync_log - EV sync operation tracking');
    console.log('  3. rpa_raw_snapshots - Raw RPA data from Algolia (NEW)');
    console.log('  4. rpa_sync_log - RPA sync operation tracking (NEW)');
    console.log('');
    console.log('You can now view the sheets at:');
    console.log(`  https://docs.google.com/spreadsheets/d/${process.env.VITE_TECH_METRICS_SHEETS_ID}/edit`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Trigger a sync: POST /api/rpa-metrics/sync');
    console.log('  2. Verify data in Google Sheets');
    console.log('  3. Access dashboard at /rpa-metrics');
    console.log('');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ ERROR:');
    console.error(error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    console.error('');
    console.error('='.repeat(60));

    process.exit(1);
  }
}

main();
