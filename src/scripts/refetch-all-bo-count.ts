/**
 * Re-fetch ALL BO Count Values (Optimized)
 *
 * Re-fetches bo_count from Firestore for EVERY order in unique_orders_status,
 * regardless of whether it already has a value. Only writes to the sheet
 * for rows where the value actually changed.
 *
 * Optimizations:
 * - Fetches all order IDs at once, batched in chunks of 500 (getAll limit)
 * - Runs 5 Firestore batches in parallel
 * - Only writes changed values to Sheets (saves API quota)
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { fetchBoCountBatch } from '../services/bo-count-fetch.service';

export async function refetchAllBoCount() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Re-fetch ALL BO Count Values from Firestore  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  try {
    console.log('Reading unique_orders_status sheet...\n');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      console.log('No data found (empty sheet or header only)');
      return;
    }

    const headers = rows[0];
    const orderIdIdx = headers.indexOf('order_id');
    const boCountIdx = headers.indexOf('bo_count');

    if (boCountIdx === -1) {
      console.error('❌ bo_count column not found in sheet headers');
      process.exit(1);
    }

    // Collect all orders with their row positions and current values
    const allOrders: Array<{ orderId: string; rowIndex: number; oldBoCount: string }> = [];

    rows.slice(1).forEach((row, idx) => {
      const orderId = row[orderIdIdx];
      if (!orderId) return;
      allOrders.push({
        orderId,
        rowIndex: idx + 2,
        oldBoCount: row[boCountIdx] || '',
      });
    });

    const totalOrders = allOrders.length;
    console.log(`Total orders: ${totalOrders.toLocaleString()}`);
    console.log(`Fetching bo_count from Firestore (batches of 500, 5 parallel)...\n`);

    // Fetch ALL bo_counts in one shot (batched + parallel internally)
    const allOrderIds = allOrders.map((o) => o.orderId);
    const startTime = Date.now();
    const boCountMap = await fetchBoCountBatch(allOrderIds, { concurrency: 5 });
    const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Fetched ${boCountMap.size.toLocaleString()} values from Firestore in ${fetchDuration}s\n`);

    // Filter to only changed values
    const changedUpdates: Array<{ range: string; values: any[][] }> = [];
    let unchangedCount = 0;

    for (const order of allOrders) {
      const newBoCount = boCountMap.get(order.orderId) || 1;
      if (String(newBoCount) !== order.oldBoCount) {
        changedUpdates.push({
          range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AO${order.rowIndex}`,
          values: [[newBoCount]],
        });
      } else {
        unchangedCount++;
      }
    }

    console.log(`Values changed: ${changedUpdates.length.toLocaleString()}`);
    console.log(`Values unchanged (skipping): ${unchangedCount.toLocaleString()}\n`);

    if (changedUpdates.length === 0) {
      console.log('🎉 All bo_count values are already up to date!');
      return;
    }

    // Write changed values to Sheets in batches (Sheets API limit: ~100K cells per batchUpdate)
    const sheetBatchSize = 5000;
    const sheetStartTime = Date.now();

    for (let i = 0; i < changedUpdates.length; i += sheetBatchSize) {
      const batch = changedUpdates.slice(i, i + sheetBatchSize);
      const batchNum = Math.floor(i / sheetBatchSize) + 1;
      const totalBatches = Math.ceil(changedUpdates.length / sheetBatchSize);

      console.log(`   Writing batch ${batchNum}/${totalBatches} (${batch.length} rows)...`);

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: batch,
        },
      });
    }

    const sheetDuration = ((Date.now() - sheetStartTime) / 1000).toFixed(1);

    // Statistics
    const allBoCountValues = Array.from(boCountMap.values());
    const withBoCountGt1 = allBoCountValues.filter((v) => v > 1).length;
    const maxBoCount = allBoCountValues.length > 0 ? allBoCountValues.reduce((a, b) => Math.max(a, b), 0) : 0;

    console.log('\n' + '═'.repeat(70));
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  RE-FETCH COMPLETE                             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   Total Orders: ${totalOrders.toLocaleString()}`);
    console.log(`   Rows Updated: ${changedUpdates.length.toLocaleString()}`);
    console.log(`   Rows Skipped (unchanged): ${unchangedCount.toLocaleString()}`);
    console.log(`   Orders with bo_count > 1: ${withBoCountGt1}`);
    console.log(`   Max bo_count: ${maxBoCount}`);
    console.log(`   Firestore fetch: ${fetchDuration}s`);
    console.log(`   Sheets write: ${sheetDuration}s`);
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
