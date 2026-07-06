/**
 * Initialize business_metrics_daily Sheet
 *
 * Creates the business_metrics_daily sheet in UNIQUE_STATUS_SHEETS_ID spreadsheet
 * with the proper header row for storing pre-calculated business metrics.
 *
 * Schema: 23 columns (org × date level aggregates)
 * - Dimensions: created_at_date, facility_id
 * - Volume Metrics: total_orders, orders_assigned, orders_completed, orders_inprogress, total_billable_orders
 * - Status Distribution: 11 status type counts
 * - Calculated Rates: approval_rate_pct, authorization_rate_pct, order_completion_pct, order_inprogress_pct
 * - Metadata: last_updated_timestamp
 *
 * Usage:
 *   npm run cli init-business-metrics-sheet
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { getSpreadsheetId, getSheetsClient } from '../services/sheets-dual';

const SHEET_NAME = 'business_metrics_daily';

async function initBusinessMetricsSheet() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Initialize business_metrics_daily Sheet      ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  console.log(`Spreadsheet ID: ${spreadsheetId}`);
  console.log(`Sheet Name: ${SHEET_NAME}\n`);

  try {
    // Check if sheet already exists
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetExists = spreadsheetMeta.data.sheets?.some(
      (sheet) => sheet.properties?.title === SHEET_NAME
    );

    if (sheetExists) {
      console.log(`⚠️  Sheet "${SHEET_NAME}" already exists`);
      console.log('   Do you want to recreate it? (This will delete existing data)');
      console.log('   Skipping... (run manually if you want to recreate)\n');
      return;
    }

    // Create the sheet
    console.log(`Creating sheet: ${SHEET_NAME}...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAME,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 23,
                  frozenRowCount: 1, // Freeze header row
                },
              },
            },
          },
        ],
      },
    });
    console.log('✅ Sheet created successfully\n');

    // Define header row (23 columns)
    const headers = [
      // Dimensions (2)
      'created_at_date',
      'facility_id',

      // Volume Metrics (5)
      'total_orders',
      'orders_assigned',
      'orders_completed',
      'orders_inprogress',
      'total_billable_orders',

      // Status Distribution (11) - auth_status for in progress/completed only
      'status_auth_by_risa',
      'status_auth_on_file',
      'status_no_auth_required',
      'status_denial_by_risa',
      'status_denial_after_query',
      'status_existing_denial',
      'status_query',
      'status_pending',
      'status_hold',
      'status_auth_required',
      'status_other',

      // Calculated Rates (4)
      'approval_rate_pct',
      'authorization_rate_pct',
      'order_completion_pct',
      'order_inprogress_pct',

      // Metadata (1)
      'last_updated_timestamp',
    ];

    // Write header row
    console.log('Writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:W1`, // 23 columns (A-W)
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
    console.log('✅ Header row written\n');

    // Format header row (bold, frozen)
    const sheetId = (
      await sheets.spreadsheets.get({ spreadsheetId })
    ).data.sheets?.find((s) => s.properties?.title === SHEET_NAME)?.properties
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
    console.log(`✅ business_metrics_daily sheet initialized successfully`);
    console.log(`   Spreadsheet ID: ${spreadsheetId}`);
    console.log(`   Sheet Name: ${SHEET_NAME}`);
    console.log(`   Columns: ${headers.length} (23 columns)\n`);
    console.log('Next steps:');
    console.log('1. Run backfill script to populate last 14 days of data');
    console.log('   npm run cli backfill-business-metrics');
    console.log('2. Update Business View to query this sheet');
    console.log('');
  } catch (error) {
    console.error('❌ Error initializing sheet:', error);
    process.exit(1);
  }
}

export { initBusinessMetricsSheet };
