/**
 * Check unique_orders_status sheet capacity and usage
 *
 * The unique_orders_status sheet has a 10M cell limit (Google Sheets hard cap).
 * This script calculates current usage and remaining capacity.
 *
 * Usage: npm run check-unique-orders-capacity
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

const GOOGLE_SHEETS_CELL_LIMIT = 10_000_000; // 10M cell hard cap
const UNIQUE_STATUS_COLUMNS = 41; // A-AO columns (see init-unique-order-status-sheet.ts)

async function checkUniqueOrdersCapacity() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured!');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  UNIQUE ORDERS SHEET CAPACITY CHECK            ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nSpreadsheet ID: ${spreadsheetId}\n`);

  try {
    // Get spreadsheet metadata
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });

    let totalCells = 0;
    let uniqueOrdersSheet = null;

    // Calculate cell count for all sheets
    console.log('📊 Sheet-by-sheet breakdown:\n');
    metadata.data.sheets?.forEach((sheet) => {
      const rows = sheet.properties?.gridProperties?.rowCount || 0;
      const cols = sheet.properties?.gridProperties?.columnCount || 0;
      const cellCount = rows * cols;
      const sheetName = sheet.properties?.title || 'Unknown';

      console.log(
        `   ${sheetName.padEnd(30)} ${rows.toLocaleString().padStart(6)} rows × ${cols
          .toString()
          .padStart(3)} cols = ${cellCount.toLocaleString().padStart(12)} cells`
      );

      totalCells += cellCount;

      // Track unique_orders_status specifically
      if (sheetName === SHEET_NAMES.UNIQUE_ORDER_STATUS) {
        uniqueOrdersSheet = { rows, cols, cellCount };
      }
    });

    console.log(`\n${'TOTAL'.padEnd(30)} ${totalCells.toLocaleString().padStart(30)} cells`);
    console.log('─'.repeat(70));

    // Calculate usage percentage
    const usagePercent = ((totalCells / GOOGLE_SHEETS_CELL_LIMIT) * 100).toFixed(2);
    const remainingCells = GOOGLE_SHEETS_CELL_LIMIT - totalCells;
    const remainingPercent = ((remainingCells / GOOGLE_SHEETS_CELL_LIMIT) * 100).toFixed(2);

    console.log(`\n📈 Overall Spreadsheet Usage:`);
    console.log(`   Used:       ${totalCells.toLocaleString()} / ${GOOGLE_SHEETS_CELL_LIMIT.toLocaleString()} cells (${usagePercent}%)`);
    console.log(`   Remaining:  ${remainingCells.toLocaleString()} cells (${remainingPercent}%)`);

    // Get warning level
    let warningLevel = '';
    if (parseFloat(usagePercent) >= 90) {
      warningLevel = '🔴 CRITICAL - Immediate action required!';
    } else if (parseFloat(usagePercent) >= 75) {
      warningLevel = '🟠 WARNING - Plan archival strategy';
    } else if (parseFloat(usagePercent) >= 50) {
      warningLevel = '🟡 CAUTION - Monitor closely';
    } else {
      warningLevel = '🟢 HEALTHY - Plenty of capacity';
    }

    console.log(`\n   Status:     ${warningLevel}`);

    // Analyze unique_orders_status specifically
    if (uniqueOrdersSheet) {
      console.log(`\n🎯 unique_orders_status Sheet Analysis:`);
      console.log(
        `   Current size:    ${uniqueOrdersSheet.rows.toLocaleString()} rows × ${uniqueOrdersSheet.cols} cols = ${uniqueOrdersSheet.cellCount.toLocaleString()} cells`
      );

      // Calculate order count (subtract 1 for header row)
      const orderCount = uniqueOrdersSheet.rows - 1;
      console.log(`   Order count:     ${orderCount.toLocaleString()} orders (excluding header)`);

      // Calculate max capacity if this sheet used all 10M cells
      const maxRowsWith41Cols = Math.floor(GOOGLE_SHEETS_CELL_LIMIT / UNIQUE_STATUS_COLUMNS);
      const maxOrders = maxRowsWith41Cols - 1; // subtract header row
      console.log(
        `   Max capacity:    ${maxOrders.toLocaleString()} orders (with ${UNIQUE_STATUS_COLUMNS} columns)`
      );

      // Calculate remaining capacity
      const remainingOrders = maxOrders - orderCount;
      const orderUsagePercent = ((orderCount / maxOrders) * 100).toFixed(2);
      console.log(
        `   Remaining:       ${remainingOrders.toLocaleString()} orders (${(100 - parseFloat(orderUsagePercent)).toFixed(2)}%)`
      );
      console.log(`   Usage:           ${orderUsagePercent}% of max capacity`);

      // Check actual column count vs expected
      if (uniqueOrdersSheet.cols !== UNIQUE_STATUS_COLUMNS) {
        console.log(
          `\n   ⚠️  WARNING: Expected ${UNIQUE_STATUS_COLUMNS} columns but found ${uniqueOrdersSheet.cols}`
        );
      }

      // Estimate days until capacity at current rate
      // Read a few recent dates to estimate daily growth
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!B2:B1000`, // created_at_iso column
      });

      const dates = (response.data.values || [])
        .map((row) => row[0])
        .filter((v) => v)
        .map((v) => v.split('T')[0]); // Extract date part

      if (dates.length > 0) {
        // Count unique dates
        const uniqueDates = new Set(dates);
        const daysWithData = uniqueDates.size;
        const avgOrdersPerDay = orderCount / daysWithData;

        console.log(`\n   Growth analysis:`);
        console.log(`   Days with data:  ${daysWithData} days`);
        console.log(`   Avg orders/day:  ${Math.round(avgOrdersPerDay).toLocaleString()}`);

        if (avgOrdersPerDay > 0) {
          const daysUntilFull = Math.floor(remainingOrders / avgOrdersPerDay);
          console.log(`   Days until full: ~${daysUntilFull.toLocaleString()} days`);

          // Note about 14-day archival
          console.log(
            `\n   ℹ️  Note: Orders older than 14 days are automatically archived`
          );
          console.log(
            `      (see archiveOldUniqueOrders() in sheets-retention.ts)`
          );
          console.log(
            `      If archival is working, the sheet should stabilize at ~14 days of data`
          );

          // Calculate steady-state capacity
          const steadyStateOrders = avgOrdersPerDay * 14;
          console.log(
            `\n   Steady-state estimate: ${Math.round(steadyStateOrders).toLocaleString()} orders (14 days @ ${Math.round(avgOrdersPerDay)} orders/day)`
          );
          const steadyStatePercent = ((steadyStateOrders / maxOrders) * 100).toFixed(2);
          console.log(`   Steady-state usage:    ${steadyStatePercent}% of max capacity`);

          if (parseFloat(steadyStatePercent) > 80) {
            console.log(
              `\n   🔴 WARNING: Even with 14-day archival, steady-state usage will be ${steadyStatePercent}%!`
            );
            console.log(`      Consider reducing retention window or increasing archival frequency.`);
          }
        }
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Capacity check completed\n');
  } catch (error: any) {
    console.error('❌ Error checking capacity:', error.message);
    process.exit(1);
  }
}

// Run the check
checkUniqueOrdersCapacity().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
