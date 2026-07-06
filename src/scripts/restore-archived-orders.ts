/**
 * Restore archived orders back to unique_orders_status sheet
 *
 * This script moves all orders from unique_orders_archive back to unique_orders_status
 * and clears the archive sheet.
 *
 * Usage: npm run restore-archived-orders
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function restoreArchivedOrders() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  RESTORE ARCHIVED ORDERS                       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const uniqueStatusSpreadsheetId = getSpreadsheetId('unique_status');
  const archiveSpreadsheetId = getSpreadsheetId('archive');

  if (!uniqueStatusSpreadsheetId || !archiveSpreadsheetId) {
    console.error('❌ Spreadsheet IDs not configured properly');
    process.exit(1);
  }

  console.log(`Source (Archive): ${archiveSpreadsheetId}`);
  console.log(`Target (Main): ${uniqueStatusSpreadsheetId}\n`);

  try {
    // Step 1: Read all data from archive
    console.log('📖 Reading data from archive...');
    const archiveResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: archiveSpreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A:AQ`,
    });

    const archiveRows = archiveResponse.data.values || [];

    if (archiveRows.length <= 1) {
      console.log('✅ No archived orders found. Nothing to restore.');
      return;
    }

    const dataRows = archiveRows.slice(1); // Skip header
    console.log(`   Found ${dataRows.length} orders in archive\n`);

    // Step 2: Append archived data back to main sheet
    console.log(`📝 Restoring ${dataRows.length} orders to main sheet...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: uniqueStatusSpreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: dataRows,
      },
    });
    console.log(`✅ Successfully restored ${dataRows.length} orders\n`);

    // Step 3: Clear the archive sheet data (keep header)
    console.log('🗑️  Clearing archive sheet...');

    // Clear all data rows (keep header row)
    if (dataRows.length > 0) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: archiveSpreadsheetId,
        range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A2:AO`, // Clear from row 2 onwards
      });
      console.log(`✅ Archive sheet cleared (kept header row)\n`);
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  RESTORATION COMPLETE                          ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`✅ ${dataRows.length} orders restored to unique_orders_status`);
    console.log(`✅ Archive sheet cleared`);
    console.log(`\nNext: Run 'npm run check-unique-orders-capacity' to verify\n`);
  } catch (error: any) {
    console.error('❌ Error during restoration:', error.message);
    process.exit(1);
  }
}

// Run the restoration
restoreArchivedOrders().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
