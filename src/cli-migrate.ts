/**
 * CLI Migration Script for Dual-Spreadsheet Architecture
 *
 * Migrates data from single legacy spreadsheet to dual-spreadsheet setup:
 * - RAW DATA LAKE: orders_raw_hourly, config_sync_log
 * - DASHBOARD: org/person metrics, daily_summary, person_level_queues, config_working_days
 *
 * Usage:
 *   npm run cli migrate -- --days 7   (Migrate last 7 days)
 *   npm run cli migrate -- --all      (Migrate ALL data - use with caution!)
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { subDays, format } from 'date-fns';
import {
  LEGACY_SHEETS_ID,
  RAW_DATA_SHEETS_ID,
  DASHBOARD_SHEETS_ID,
} from './config/data-source.config';

const getEnv = (key: string) => process.env[key];

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

const SHEET_NAMES = {
  RAW_HOURLY: 'orders_raw_hourly',
  ORG_METRICS: 'org_hourly_metrics',
  PERSON_METRICS: 'person_hourly_performance',
  WORKING_DAYS: 'config_working_days',
  DAILY_SUMMARY: 'daily_summary',
  SYNC_LOG: 'config_sync_log',
  PERSON_QUEUES: 'person_level_queues',
};

/**
 * Copy data from legacy sheet to new sheet with date filtering
 */
async function copySheetData(
  sheetName: string,
  fromSpreadsheetId: string,
  toSpreadsheetId: string,
  dateColumn?: number,
  retentionDays?: number
): Promise<number> {
  const sheets = getSheetsClient();

  console.log(`\n📋 Migrating ${sheetName}...`);

  // Read from legacy spreadsheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: fromSpreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values || [];

  if (rows.length === 0) {
    console.log(`   ⚠️  No data found in ${sheetName}`);
    return 0;
  }

  // Filter rows by date if retention policy specified
  let dataRows = rows.slice(1); // Skip header
  let filteredRows = dataRows;

  if (dateColumn !== undefined && retentionDays !== undefined) {
    const cutoffDate = format(subDays(new Date(), retentionDays), 'yyyy-MM-dd');
    console.log(`   Filtering to keep only rows after ${cutoffDate}`);

    filteredRows = dataRows.filter((row) => {
      const dateValue = row[dateColumn] || '';
      return dateValue >= cutoffDate;
    });

    console.log(
      `   Filtered: ${filteredRows.length}/${dataRows.length} rows (last ${retentionDays} days)`
    );
  }

  if (filteredRows.length === 0) {
    console.log(`   ⚠️  No data to migrate after filtering`);
    return 0;
  }

  // Write to new spreadsheet
  await sheets.spreadsheets.values.append({
    spreadsheetId: toSpreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: filteredRows,
    },
  });

  console.log(`   ✅ Migrated ${filteredRows.length} rows to ${sheetName}`);
  return filteredRows.length;
}

/**
 * Verify row counts match between legacy and new sheets
 */
async function verifyMigration(
  sheetName: string,
  legacySpreadsheetId: string,
  newSpreadsheetId: string,
  expectedRowCount: number
): Promise<boolean> {
  const sheets = getSheetsClient();

  console.log(`\n🔍 Verifying ${sheetName}...`);

  // Check new sheet
  const newResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: newSpreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const newRows = newResponse.data.values || [];
  const newDataRowCount = newRows.length - 1; // Exclude header

  if (newDataRowCount === expectedRowCount) {
    console.log(`   ✅ ${sheetName}: ${newDataRowCount} rows match expected count`);
    return true;
  } else {
    console.log(
      `   ❌ ${sheetName}: Expected ${expectedRowCount} rows, found ${newDataRowCount}`
    );
    return false;
  }
}

/**
 * Main migration function
 */
export async function migrateToTDualSheets(daysToMigrate?: number): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  DUAL-SPREADSHEET MIGRATION                    ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Validate configuration
  if (!LEGACY_SHEETS_ID || !RAW_DATA_SHEETS_ID || !DASHBOARD_SHEETS_ID) {
    console.error('❌ Missing spreadsheet IDs in .env:');
    console.error(`   VITE_GOOGLE_SHEETS_ID (legacy): ${LEGACY_SHEETS_ID || 'MISSING'}`);
    console.error(`   VITE_RAW_DATA_SHEETS_ID: ${RAW_DATA_SHEETS_ID || 'MISSING'}`);
    console.error(`   VITE_DASHBOARD_SHEETS_ID: ${DASHBOARD_SHEETS_ID || 'MISSING'}`);
    console.error('\nPlease configure all spreadsheet IDs before running migration.');
    process.exit(1);
  }

  console.log('📄 Spreadsheet Configuration:');
  console.log(`   Legacy: ${LEGACY_SHEETS_ID}`);
  console.log(`   Raw Data Lake: ${RAW_DATA_SHEETS_ID}`);
  console.log(`   Dashboard: ${DASHBOARD_SHEETS_ID}`);
  console.log('');

  if (daysToMigrate) {
    console.log(`⏱️  Migration Mode: Last ${daysToMigrate} days`);
  } else {
    console.log(`⏱️  Migration Mode: ALL DATA`);
  }

  const startTime = new Date();
  const rowCounts: Record<string, number> = {};

  try {
    // Step 1: Migrate to RAW DATA LAKE
    console.log('\n═══════════════════════════════════════════════');
    console.log('STEP 1: Migrating to RAW DATA LAKE');
    console.log('═══════════════════════════════════════════════');

    // orders_raw_hourly (filter by days if specified)
    rowCounts.orders_raw_hourly = await copySheetData(
      SHEET_NAMES.RAW_HOURLY,
      LEGACY_SHEETS_ID,
      RAW_DATA_SHEETS_ID,
      7, // created_at_date column (H = index 7)
      daysToMigrate || undefined
    );

    // config_sync_log (migrate all)
    rowCounts.config_sync_log = await copySheetData(
      SHEET_NAMES.SYNC_LOG,
      LEGACY_SHEETS_ID,
      RAW_DATA_SHEETS_ID
    );

    // Step 2: Migrate to DASHBOARD
    console.log('\n═══════════════════════════════════════════════');
    console.log('STEP 2: Migrating to DASHBOARD');
    console.log('═══════════════════════════════════════════════');

    // org_hourly_metrics (keep last 30 days)
    rowCounts.org_hourly_metrics = await copySheetData(
      SHEET_NAMES.ORG_METRICS,
      LEGACY_SHEETS_ID,
      DASHBOARD_SHEETS_ID,
      2, // created_at_date column (C = index 2)
      30
    );

    // person_hourly_performance (keep last 30 days)
    rowCounts.person_hourly_performance = await copySheetData(
      SHEET_NAMES.PERSON_METRICS,
      LEGACY_SHEETS_ID,
      DASHBOARD_SHEETS_ID,
      2, // created_at_date column (C = index 2)
      30
    );

    // daily_summary (keep last 90 days)
    rowCounts.daily_summary = await copySheetData(
      SHEET_NAMES.DAILY_SUMMARY,
      LEGACY_SHEETS_ID,
      DASHBOARD_SHEETS_ID,
      0, // created_at_date column (A = index 0)
      90
    );

    // person_level_queues (migrate all for now, retention will clean up)
    rowCounts.person_level_queues = await copySheetData(
      SHEET_NAMES.PERSON_QUEUES,
      LEGACY_SHEETS_ID,
      DASHBOARD_SHEETS_ID
    );

    // config_working_days (migrate all)
    rowCounts.config_working_days = await copySheetData(
      SHEET_NAMES.WORKING_DAYS,
      LEGACY_SHEETS_ID,
      DASHBOARD_SHEETS_ID
    );

    // Step 3: Verify migration
    console.log('\n═══════════════════════════════════════════════');
    console.log('STEP 3: Verifying Migration');
    console.log('═══════════════════════════════════════════════');

    const verifications = [
      await verifyMigration(
        SHEET_NAMES.RAW_HOURLY,
        LEGACY_SHEETS_ID,
        RAW_DATA_SHEETS_ID,
        rowCounts.orders_raw_hourly
      ),
      await verifyMigration(
        SHEET_NAMES.SYNC_LOG,
        LEGACY_SHEETS_ID,
        RAW_DATA_SHEETS_ID,
        rowCounts.config_sync_log
      ),
      await verifyMigration(
        SHEET_NAMES.ORG_METRICS,
        LEGACY_SHEETS_ID,
        DASHBOARD_SHEETS_ID,
        rowCounts.org_hourly_metrics
      ),
      await verifyMigration(
        SHEET_NAMES.PERSON_METRICS,
        LEGACY_SHEETS_ID,
        DASHBOARD_SHEETS_ID,
        rowCounts.person_hourly_performance
      ),
      await verifyMigration(
        SHEET_NAMES.DAILY_SUMMARY,
        LEGACY_SHEETS_ID,
        DASHBOARD_SHEETS_ID,
        rowCounts.daily_summary
      ),
      await verifyMigration(
        SHEET_NAMES.PERSON_QUEUES,
        LEGACY_SHEETS_ID,
        DASHBOARD_SHEETS_ID,
        rowCounts.person_level_queues
      ),
      await verifyMigration(
        SHEET_NAMES.WORKING_DAYS,
        LEGACY_SHEETS_ID,
        DASHBOARD_SHEETS_ID,
        rowCounts.config_working_days
      ),
    ];

    const allVerified = verifications.every((v) => v);

    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);

    // Summary
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  MIGRATION SUMMARY                             ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('\nRAW DATA LAKE:');
    console.log(`   orders_raw_hourly: ${rowCounts.orders_raw_hourly} rows`);
    console.log(`   config_sync_log: ${rowCounts.config_sync_log} rows`);
    console.log('\nDASHBOARD:');
    console.log(`   org_hourly_metrics: ${rowCounts.org_hourly_metrics} rows`);
    console.log(`   person_hourly_performance: ${rowCounts.person_hourly_performance} rows`);
    console.log(`   daily_summary: ${rowCounts.daily_summary} rows`);
    console.log(`   person_level_queues: ${rowCounts.person_level_queues} rows`);
    console.log(`   config_working_days: ${rowCounts.config_working_days} rows`);
    console.log(`\nDuration: ${duration}s`);
    console.log(`Status: ${allVerified ? '✅ ALL VERIFIED' : '❌ VERIFICATION FAILED'}`);
    console.log('');

    if (!allVerified) {
      console.error('❌ Migration verification failed. Please check the logs above.');
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Verify data in new spreadsheets manually');
    console.log('   2. Update frontend to read from DASHBOARD_SHEETS_ID');
    console.log('   3. Test a sync run: npm run cli sync');
    console.log('   4. Monitor for errors in scheduler.log');
    console.log('   5. Once stable, you can archive the legacy spreadsheet');
    console.log('');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// This file is imported by cli.ts - no direct execution needed
