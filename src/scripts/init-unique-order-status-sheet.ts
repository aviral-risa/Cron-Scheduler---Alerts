/**
 * Initialize unique_orders_status sheet in UNIQUE_STATUS spreadsheet
 *
 * Run this script once to create the sheet with proper headers
 * Usage: npm run init-unique-status-sheet
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function initializeUniqueOrderStatusSheet() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured!');
    console.error('   Set VITE_UNIQUE_STATUS_SHEETS_ID in your .env file');
    process.exit(1);
  }

  console.log(`Creating unique_orders_status sheet in spreadsheet: ${spreadsheetId}...`);

  const headers = [
    // Primary key
    'order_id',

    // 29 tracked fields from Algolia
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

    // General metadata (6 columns)
    'fields_hash',
    'first_synced_at',
    'last_synced_at',
    'last_changed_at',
    'sync_count',
    'change_count',

    // Auth status change tracking (5 columns)
    'auth_status_ever_changed',
    'auth_status_change_count',
    'auth_status_last_change_from',
    'auth_status_last_change_to',
    'auth_status_last_changed_at',

    // BO Count (1 column)
    'bo_count',

    // Patient MRN (1 column)
    'patient_mrn',

    // Duplicate Detection (1 column)
    'is_duplicate',
  ];

  try {
    // Create sheet tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAMES.UNIQUE_ORDER_STATUS,
              },
            },
          },
        ],
      },
    });

    console.log(`✅ Sheet tab '${SHEET_NAMES.UNIQUE_ORDER_STATUS}' created`);

    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1:AQ1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Header row written (${headers.length} columns: A-AQ)`);
    console.log('\n📊 Sheet Schema:');
    console.log('   - Primary Key: order_id');
    console.log('   - Tracked Fields: 29 columns (B-AD)');
    console.log('   - General Metadata: 6 columns (AE-AJ)');
    console.log('   - Auth Status Tracking: 5 columns (AK-AO)');
    console.log('   - BO Count: 1 column (AO)');
    console.log('   - Patient MRN: 1 column (AP)');
    console.log('   - Total: 43 columns\n');

    console.log('🎉 unique_orders_status sheet initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Set ENABLE_UNIQUE_ORDER_STATUS_SYNC=true in .env');
    console.log('2. Run: npm run sync-date <date> --sync-unique-status');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('⚠️  Sheet already exists. Skipping creation.');
    } else {
      console.error('❌ Failed to create sheet:', error.message);
      process.exit(1);
    }
  }
}

// Run the initialization
initializeUniqueOrderStatusSheet().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
