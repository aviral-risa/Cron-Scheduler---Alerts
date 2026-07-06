/**
 * Backfill ALL Missing BO Count Values
 *
 * Processes ALL orders in unique_orders_status that are missing bo_count,
 * regardless of date. Organized by date for efficient processing.
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { fetchBoCountBatch } from '../services/bo-count-fetch.service';

export async function backfillAllMissingBoCount() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill ALL Missing BO Count Values         ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  try {
    console.log('Reading unique_orders_status sheet...\n');

    // Read all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('No data found');
      return;
    }

    const headers = rows[0];
    const orderIdIdx = headers.indexOf('order_id');
    const createdAtIdx = headers.indexOf('created_at_iso');
    const orgIdIdx = headers.indexOf('org_id');
    const boCountIdx = headers.indexOf('bo_count');

    console.log(`Total orders in sheet: ${rows.length - 1}`);

    // Find all orders missing bo_count
    const missingOrders: Array<{ orderId: string; rowIndex: number; date: string; org: string }> = [];

    rows.slice(1).forEach((row, idx) => {
      const boCount = row[boCountIdx];
      if (!boCount || boCount === '') {
        const orderId = row[orderIdIdx];
        const createdAt = row[createdAtIdx];
        const orgId = row[orgIdIdx];
        const orderDate = createdAt?.split('T')[0]?.split(' ')[0] || 'unknown';

        missingOrders.push({
          orderId,
          rowIndex: idx + 2, // +2 for header and 1-indexing
          date: orderDate,
          org: orgId,
        });
      }
    });

    if (missingOrders.length === 0) {
      console.log('🎉 All orders already have bo_count populated!');
      return;
    }

    console.log(`Found ${missingOrders.length} orders missing bo_count\n`);

    // Group by date for progress tracking
    const byDate = new Map<string, typeof missingOrders>();
    missingOrders.forEach((order) => {
      if (!byDate.has(order.date)) {
        byDate.set(order.date, []);
      }
      byDate.get(order.date)!.push(order);
    });

    const dates = Array.from(byDate.keys()).sort().reverse();
    console.log(`Processing ${dates.length} unique dates...\n`);
    console.log('═'.repeat(70));

    let totalProcessed = 0;
    let totalUpdated = 0;

    for (const date of dates) {
      const dateOrders = byDate.get(date)!;
      console.log(`\n📅 ${date}: ${dateOrders.length} orders`);
      console.log('─'.repeat(70));

      // Extract order IDs
      const orderIds = dateOrders.map((o) => o.orderId);

      // Fetch bo_count from Firestore in batch
      console.log(`   Fetching from Firestore...`);
      const boCountMap = await fetchBoCountBatch(orderIds);

      // Prepare batch update for Google Sheets
      const updates = dateOrders.map((order) => {
        const boCount = boCountMap.get(order.orderId) || 1;
        return {
          range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AO${order.rowIndex}`,
          values: [[boCount]],
        };
      });

      // Batch update all bo_count values for this date
      console.log(`   Updating ${updates.length} rows in sheet...`);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates,
        },
      });

      // Statistics
      const boCountValues = Array.from(boCountMap.values());
      const withBoCountGt1 = boCountValues.filter((v) => v > 1).length;
      const maxBoCount = Math.max(...boCountValues);

      console.log(`   ✅ Updated ${updates.length} orders`);
      console.log(`      - Orders with bo_count > 1: ${withBoCountGt1}`);
      console.log(`      - Max bo_count: ${maxBoCount}`);

      totalProcessed += orderIds.length;
      totalUpdated += updates.length;
    }

    console.log('\n' + '═'.repeat(70));
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  BACKFILL COMPLETE                             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   Total Orders Processed: ${totalProcessed.toLocaleString()}`);
    console.log(`   Total Rows Updated: ${totalUpdated.toLocaleString()}`);
    console.log(`   Date Range: ${dates[dates.length - 1]} to ${dates[0]}`);
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
