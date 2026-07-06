/**
 * Deduplicate unique_orders_status sheet by order_id
 * Keeps the latest version of each order (by last_synced_at)
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function deduplicateUniqueOrders() {
  console.log('\n🔧 DEDUPLICATING unique_orders_status sheet...\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Read all data
  console.log('📖 Reading all data...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];
  const headers = rows[0];
  const dataRows = rows.slice(1);

  console.log(`   Found ${dataRows.length} total orders\n`);

  // Deduplicate by order_id (column A), keep latest by last_synced_at (column AG)
  const orderIdIndex = 0;
  const lastSyncedIndex = 31; // last_synced_at column

  const uniqueOrders = new Map<string, any[]>();

  for (const row of dataRows) {
    const orderId = row[orderIdIndex];
    const lastSynced = row[lastSyncedIndex] || '';

    if (!orderId) continue;

    const existing = uniqueOrders.get(orderId);
    if (!existing || lastSynced > (existing[lastSyncedIndex] || '')) {
      uniqueOrders.set(orderId, row);
    }
  }

  const deduplicatedRows = Array.from(uniqueOrders.values());
  const duplicateCount = dataRows.length - deduplicatedRows.length;

  console.log(`   Unique orders: ${deduplicatedRows.length}`);
  console.log(`   Duplicates removed: ${duplicateCount}\n`);

  if (duplicateCount === 0) {
    console.log('✅ No duplicates found!\n');
    return;
  }

  // Clear and rewrite sheet
  console.log('🗑️  Clearing sheet...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A2:AO`,
  });

  console.log('📝 Writing deduplicated data...');
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A2:AO`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: deduplicatedRows,
    },
  });

  console.log(`\n✅ DONE! Removed ${duplicateCount} duplicates`);
  console.log(`   Final count: ${deduplicatedRows.length} unique orders\n`);
}

deduplicateUniqueOrders().catch(console.error);
