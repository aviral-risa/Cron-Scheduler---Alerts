/**
 * Initialize unique_orders_archive Sheet
 *
 * Creates the unique_orders_archive sheet in ARCHIVE_SHEETS_ID spreadsheet
 * with the same schema as unique_orders_status (40 columns).
 *
 * Purpose: Archive orders older than 14 days from unique_orders_status
 * to maintain the 14-day rolling window and avoid hitting 10M cell limit.
 *
 * Versioning: Uses VITE_CURRENT_ARCHIVE_VERSION (v1, v2, or v3)
 * Each version can hold ~250k orders (10M cells ÷ 40 columns) ≈ 1 year of data
 *
 * Schema: Same 41 columns as unique_orders_status
 * - Primary Key: order_id
 * - 29 Tracked Fields from Algolia
 * - General Metadata (6 fields)
 * - Auth Status Change Tracking (5 fields)
 * - BO Count (1 field)
 *
 * Usage:
 *   npm run cli init-unique-orders-archive-sheet
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { getSpreadsheetId, getSheetsClient, SHEET_NAMES } from '../services/sheets-dual';
import { getCurrentArchiveVersion } from '../config/data-source.config';

async function initUniqueOrdersArchiveSheet() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Initialize unique_orders_archive Sheet       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('archive'); // Archive goes to ARCHIVE_SHEETS_ID
  const currentVersion = getCurrentArchiveVersion();

  if (!spreadsheetId) {
    console.error(`❌ ARCHIVE_${currentVersion.toUpperCase()}_SHEETS_ID not configured`);
    process.exit(1);
  }

  console.log(`Archive Version: ${currentVersion}`);
  console.log(`Spreadsheet ID: ${spreadsheetId}`);
  console.log(`Sheet Name: ${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}\n`);

  try {
    // Check if sheet already exists
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetExists = spreadsheetMeta.data.sheets?.some(
      (sheet) => sheet.properties?.title === SHEET_NAMES.UNIQUE_ORDER_ARCHIVE
    );

    if (sheetExists) {
      console.log(`⚠️  Sheet "${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}" already exists`);
      console.log('   Sheet is ready for archival');
      console.log('   (If you need to recreate it, delete it manually first)\n');
      return;
    }

    // Create the sheet
    console.log(`Creating sheet: ${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAMES.UNIQUE_ORDER_ARCHIVE,
                gridProperties: {
                  rowCount: 100000, // Large capacity for historical data
                  columnCount: 42,
                  frozenRowCount: 1, // Freeze header row
                },
              },
            },
          },
        ],
      },
    });
    console.log('✅ Sheet created successfully\n');

    // Define header row (same as unique_orders_status - 41 columns)
    const headers = [
      // Primary Key
      'order_id',

      // 29 Tracked Fields from Algolia
      'created_at_iso',
      'indexed_at_iso',
      'assigned_to_name',
      'primary_payer_name',
      'regimen_name',
      'date_of_service_iso',
      'org_id',
      'primary_active',
      'ev_bv_primary',
      'document_upload_status',
      'ev_write_back_status',
      'bo_status',
      'master_auth_status',
      'mark_as_completed',
      'auth_on_file_status',
      'auth_on_file_updated_at',
      'auth_status',
      'medical_order_status',
      'regimen_type',
      'auth_on_file_error_type',
      'auth_on_file_error_message',
      'nar_check_status',
      'date_of_work_iso',
      'assigned_at_iso',
      'health_first_nar_rpa_status',
      'submission',
      'fax_submission_status',
      'medical_order_review_status',

      // General Metadata (6 fields)
      'fields_hash',
      'first_synced_at',
      'last_synced_at',
      'last_changed_at',
      'sync_count',
      'change_count',

      // Auth Status Change Tracking (5 fields)
      'auth_status_ever_changed',
      'auth_status_change_count',
      'auth_status_last_change_from',
      'auth_status_last_change_to',
      'auth_status_last_changed_at',

      // BO Count (1 field)
      'bo_count',

      // Patient MRN (1 field)
      'patient_mrn',

      // Duplicate Detection (1 field)
      'is_duplicate',
    ];

    // Write header row
    console.log('Writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A1:AQ1`, // 43 columns (A-AQ)
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
    console.log('✅ Header row written\n');

    // Format header row (bold, frozen)
    const sheetId = (
      await sheets.spreadsheets.get({ spreadsheetId })
    ).data.sheets?.find((s) => s.properties?.title === SHEET_NAMES.UNIQUE_ORDER_ARCHIVE)?.properties
      ?.sheetId;

    if (sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true,
                    },
                    backgroundColor: {
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9,
                    },
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
          ],
        },
      });
      console.log('✅ Header formatting applied\n');
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  SUCCESS                                       ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`✅ unique_orders_archive sheet initialized successfully`);
    console.log(`   Spreadsheet ID: ${spreadsheetId}`);
    console.log(`   Sheet Name: ${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}`);
    console.log(`   Columns: ${headers.length} (43 columns - same as unique_orders_status)\n`);
    console.log('Next steps:');
    console.log('1. The retention policy will automatically archive orders > 14 days old');
    console.log('2. Archive runs daily at 3 AM IST as part of retention cleanup');
    console.log('3. Archived data preserved for manual queries/analysis');
    console.log('');
  } catch (error) {
    console.error('❌ Error initializing sheet:', error);
    process.exit(1);
  }
}

export { initUniqueOrdersArchiveSheet };
