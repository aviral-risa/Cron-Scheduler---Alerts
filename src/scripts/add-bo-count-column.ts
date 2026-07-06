/**
 * Add bo_count Column to unique_orders_status Sheet
 *
 * Adds the bo_count column (column AO, 41st column) to the existing
 * unique_orders_status sheet without losing data.
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function addBoCountColumn() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Add bo_count Column to unique_orders_status  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  try {
    // 1. Read the current header row
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1:AN1`,
    });

    const currentHeaders = headerResponse.data.values?.[0] || [];
    console.log(`Current column count: ${currentHeaders.length}`);

    // 2. Check if bo_count already exists
    if (currentHeaders.includes('bo_count')) {
      console.log('✅ bo_count column already exists!');
      console.log(`   Position: Column ${currentHeaders.indexOf('bo_count') + 1} (${String.fromCharCode(65 + currentHeaders.indexOf('bo_count'))})`);
      return;
    }

    // 3. Check if we have exactly 40 columns (AN)
    if (currentHeaders.length !== 40) {
      console.error(`❌ Unexpected column count: ${currentHeaders.length} (expected 40)`);
      console.error('   Please verify the sheet schema before adding bo_count');
      process.exit(1);
    }

    // 4. First, expand the sheet to 41 columns
    console.log('\nExpanding sheet to 41 columns...');

    // Get sheet metadata to find the sheetId
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = sheetMeta.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAMES.UNIQUE_ORDER_STATUS
    );

    if (!sheet || sheet.properties?.sheetId === undefined) {
      throw new Error('Could not find unique_orders_status sheet');
    }

    const sheetId = sheet.properties.sheetId;

    // Expand the grid to 41 columns
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  columnCount: 41,
                },
              },
              fields: 'gridProperties.columnCount',
            },
          },
        ],
      },
    });

    console.log('✅ Sheet expanded to 41 columns');

    // 5. Add bo_count header to column AO (41st column)
    console.log('\nAdding bo_count header...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AO1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['bo_count']],
      },
    });

    console.log('✅ bo_count column added successfully!');
    console.log('   Position: Column AO (41st column)');
    console.log('\n📋 Sheet Schema:');
    console.log('   - Primary Key: order_id');
    console.log('   - Tracked Fields: 29 columns (B-AD)');
    console.log('   - General Metadata: 6 columns (AE-AJ)');
    console.log('   - Auth Status Tracking: 5 columns (AK-AN)');
    console.log('   - BO Count: 1 column (AO)');
    console.log('   - Total: 41 columns\n');

    console.log('Next step:');
    console.log('  Run: npm run cli backfill-bo-count 2026-02-03');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error adding column:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
