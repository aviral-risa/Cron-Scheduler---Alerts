/**
 * Initialize payer_treatment_aging Sheet
 *
 * Creates the payer_treatment_aging sheet in the PAYER_AGING spreadsheet
 * with the proper header row for storing payer-level treatment aging metrics.
 *
 * Schema: 14 columns (A-N)
 * - Dimensions: created_at_date, facility_id, payer_name
 * - Loaded Metrics: total_orders_loaded, loaded buckets (4)
 * - Billed Metrics: total_orders_billed, billed buckets (4)
 * - Metadata: last_updated_timestamp
 *
 * Usage:
 *   npm run cli payer-aging-init
 */

import 'dotenv/config';
import { getSpreadsheetId, getSheetsClient } from '../services/sheets-dual';

const SHEET_NAME = 'payer_treatment_aging';

async function initPayerTreatmentAgingSheet() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Initialize payer_treatment_aging Sheet        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('payer_aging');

  if (!spreadsheetId) {
    console.error('❌ VITE_PAYER_AGING_SHEETS_ID not configured');
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
                  rowCount: 5000,
                  columnCount: 14,
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      },
    });
    console.log('✅ Sheet created successfully\n');

    // Define header row (14 columns A-N)
    const headers = [
      'created_at_date',
      'facility_id',
      'payer_name',
      'total_orders_loaded',
      'total_orders_billed',
      'loaded_0_to_7',
      'loaded_8_to_14',
      'loaded_15_to_21',
      'loaded_21_plus',
      'billed_0_to_7',
      'billed_8_to_14',
      'billed_15_to_21',
      'billed_21_plus',
      'last_updated_timestamp',
    ];

    // Write header row
    console.log('Writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:N1`, // 14 columns (A-N)
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
    console.log('✅ Header row written\n');

    // Format header row (bold, gray background)
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
    console.log(`✅ payer_treatment_aging sheet initialized successfully`);
    console.log(`   Spreadsheet ID: ${spreadsheetId}`);
    console.log(`   Sheet Name: ${SHEET_NAME}`);
    console.log(`   Columns: ${headers.length} (14 columns A-N)\n`);
    console.log('Next steps:');
    console.log('1. Run backfill script to populate data');
    console.log('   npm run cli payer-aging-backfill');
    console.log('');
  } catch (error) {
    console.error('❌ Error initializing sheet:', error);
    process.exit(1);
  }
}

export { initPayerTreatmentAgingSheet };
