/**
 * Check what data exists in unique_orders_status
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function checkUniqueOrdersData() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Check unique_orders_status Data              ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  console.log(`Spreadsheet ID: ${spreadsheetId}\n`);

  try {
    // Read first 500 rows to get a sample
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A2:H500`,
    });

    const rows = response.data.values || [];
    console.log(`Total rows read: ${rows.length}\n`);

    if (rows.length === 0) {
      console.log('❌ No data found in unique_orders_status');
      console.log('\nTo populate data, run:');
      console.log('  npm run cli sync-date YYYY-MM-DD -- --sync-unique-status');
      return;
    }

    // Group by date and org
    const dateOrgCounts = new Map<string, number>();
    const dateSet = new Set<string>();
    const orgSet = new Set<string>();

    rows.forEach(row => {
      const createdAt = row[1] || ''; // created_at_iso (column B)
      const orgId = row[7] || ''; // org_id (column H, index 7)
      const date = createdAt.split('T')[0];

      if (date && orgId) {
        const key = `${date}|${orgId}`;
        dateOrgCounts.set(key, (dateOrgCounts.get(key) || 0) + 1);
        dateSet.add(date);
        orgSet.add(orgId);
      }
    });

    console.log(`✅ Found data:`);
    console.log(`  Total unique dates: ${dateSet.size}`);
    console.log(`  Total unique orgs: ${orgSet.size}`);
    console.log(`  Orgs: ${Array.from(orgSet).join(', ')}\n`);

    // Sort by date (most recent first)
    const sortedEntries = Array.from(dateOrgCounts.entries()).sort((a, b) => {
      const [dateA] = a[0].split('|');
      const [dateB] = b[0].split('|');
      return dateB.localeCompare(dateA);
    });

    console.log('Recent data (last 20 date-org combinations):\n');
    console.log('Date       | Org    | Orders');
    console.log('-----------|--------|--------');

    sortedEntries.slice(0, 20).forEach(([key, count]) => {
      const [date, org] = key.split('|');
      console.log(`${date} | ${org.padEnd(6)} | ${count}`);
    });

    // Find most recent date with data
    const dates = Array.from(dateSet).sort().reverse();
    const mostRecentDate = dates[0];

    console.log(`\n💡 Suggestion:`);
    console.log(`   Most recent date with data: ${mostRecentDate}`);
    console.log(`   Run test backfill with this date instead of today`);

  } catch (error) {
    console.error('❌ Error reading data:', error);
  }
}
