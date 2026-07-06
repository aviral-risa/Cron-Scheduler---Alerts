/**
 * Initialize Tech Metrics Google Sheets
 *
 * This script creates the necessary sheet tabs with headers
 * for the Tech Metrics (EV Metrics) tracking system.
 *
 * Run: npx tsx src/scripts/init-tech-metrics-sheets.ts
 */

import * as dotenv from 'dotenv';
import { initializeTechMetricsSheets } from '../services/sheets/techMetricsSheets';

// Load environment variables from .env file
dotenv.config();

async function main() {
  console.log('='.repeat(60));
  console.log('Tech Metrics Sheets Initialization');
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('Initializing Tech Metrics sheets...');
    console.log('Sheet ID:', process.env.VITE_TECH_METRICS_SHEETS_ID);
    console.log('');

    await initializeTechMetricsSheets();

    console.log('');
    console.log('✅ SUCCESS!');
    console.log('');
    console.log('Tech Metrics sheets have been initialized with the following tabs:');
    console.log('  1. ev_raw_snapshots - Raw EV data from Algolia');
    console.log('  2. ev_sync_log - Sync operation tracking');
    console.log('');
    console.log('You can now view the sheets at:');
    console.log(`  https://docs.google.com/spreadsheets/d/${process.env.VITE_TECH_METRICS_SHEETS_ID}/edit`);
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
