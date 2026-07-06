/**
 * Check for Orders Missing BO Count
 *
 * Analyzes the unique_orders_status sheet to find orders without bo_count
 * and shows date distribution to identify gaps.
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function checkMissingBoCount() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Check Missing BO Count Values                ║');
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

    if (boCountIdx === -1) {
      console.error('❌ bo_count column not found');
      process.exit(1);
    }

    console.log(`Total rows: ${rows.length - 1} (excluding header)`);
    console.log(`bo_count column: ${String.fromCharCode(65 + boCountIdx)} (index ${boCountIdx})\n`);

    // Analyze missing bo_count
    const missingByDate = new Map<string, { count: number; orgCounts: Map<string, number> }>();
    const missingOrderIds: string[] = [];
    let totalMissing = 0;
    let totalPresent = 0;

    rows.slice(1).forEach((row) => {
      const orderId = row[orderIdIdx];
      const createdAt = row[createdAtIdx];
      const orgId = row[orgIdIdx];
      const boCount = row[boCountIdx];

      // Extract date from created_at
      const orderDate = createdAt?.split('T')[0]?.split(' ')[0] || 'unknown';

      if (!boCount || boCount === '') {
        totalMissing++;
        missingOrderIds.push(orderId);

        // Track by date
        if (!missingByDate.has(orderDate)) {
          missingByDate.set(orderDate, { count: 0, orgCounts: new Map() });
        }
        const dateInfo = missingByDate.get(orderDate)!;
        dateInfo.count++;

        // Track by org within date
        const orgCount = dateInfo.orgCounts.get(orgId) || 0;
        dateInfo.orgCounts.set(orgId, orgCount + 1);
      } else {
        totalPresent++;
      }
    });

    // Sort dates
    const sortedDates = Array.from(missingByDate.keys()).sort().reverse();

    console.log('═'.repeat(70));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total Orders: ${totalMissing + totalPresent}`);
    console.log(`✅ With bo_count: ${totalPresent} (${((totalPresent / (totalMissing + totalPresent)) * 100).toFixed(1)}%)`);
    console.log(`❌ Missing bo_count: ${totalMissing} (${((totalMissing / (totalMissing + totalPresent)) * 100).toFixed(1)}%)`);

    if (totalMissing === 0) {
      console.log('\n🎉 All orders have bo_count populated!');
      return;
    }

    console.log('\n═'.repeat(70));
    console.log('📅 MISSING BO_COUNT BY DATE');
    console.log('═'.repeat(70));
    console.log('Date         | Total Missing | By Organization');
    console.log('-'.repeat(70));

    sortedDates.forEach((date) => {
      const info = missingByDate.get(date)!;
      const orgBreakdown = Array.from(info.orgCounts.entries())
        .map(([org, count]) => `${org}: ${count}`)
        .join(', ');
      console.log(`${date} | ${info.count.toString().padStart(13)} | ${orgBreakdown}`);
    });

    console.log('\n═'.repeat(70));
    console.log('🔍 DATE RANGE ANALYSIS');
    console.log('═'.repeat(70));
    const oldestDate = sortedDates[sortedDates.length - 1];
    const newestDate = sortedDates[0];
    console.log(`Oldest missing: ${oldestDate}`);
    console.log(`Newest missing: ${newestDate}`);

    // Show first 10 missing order IDs
    console.log('\n═'.repeat(70));
    console.log('📋 SAMPLE MISSING ORDER IDs (first 10)');
    console.log('═'.repeat(70));
    missingOrderIds.slice(0, 10).forEach((id, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${id}`);
    });

    if (missingOrderIds.length > 10) {
      console.log(`... and ${missingOrderIds.length - 10} more`);
    }

    console.log('\n💡 RECOMMENDATION:');
    if (oldestDate < '2026-01-21') {
      console.log(`   Orders before 2026-01-21 need backfilling.`);
      console.log(`   Run: npm run cli backfill-bo-count-range --days <N>`);
      console.log(`   where N covers the date range back to ${oldestDate}`);
    } else {
      console.log(`   All missing orders are within recent dates.`);
      console.log(`   This might indicate Firestore fetch issues.`);
      console.log(`   Try re-running the backfill for specific dates.`);
    }
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
