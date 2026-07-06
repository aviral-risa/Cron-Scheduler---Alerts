/**
 * Deduplicate unique_orders_status sheet by order_id (BATCHED VERSION)
 * Keeps the latest version of each order (by last_synced_at)
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function deduplicateUniqueOrders() {
  console.log('\n🔧 DEDUPLICATING unique_orders_status sheet (BATCHED)...\n');

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

  // Clear sheet
  console.log('🗑️  Clearing sheet...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A2:AO`,
  });

  // Write back in batches of 5000 rows
  console.log('📝 Writing deduplicated data in batches...');
  const BATCH_SIZE = 5000;
  let written = 0;

  for (let i = 0; i < deduplicatedRows.length; i += BATCH_SIZE) {
    const batch = deduplicatedRows.slice(i, i + BATCH_SIZE);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: batch,
      },
    });

    written += batch.length;
    console.log(`   Wrote ${written}/${deduplicatedRows.length} orders`);

    // Small delay between batches
    if (i + BATCH_SIZE < deduplicatedRows.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ DONE! Removed ${duplicateCount} duplicates`);
  console.log(`   Final count: ${deduplicatedRows.length} unique orders\n`);
}

deduplicateUniqueOrders().catch(console.error);
