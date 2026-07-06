/**
 * Show Complete Auth Status Table
 *
 * Displays all unique auth_status values with full statistics across all facilities
 */

import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { ORGANIZATIONS } from '../config/organizations';

export async function showCompleteAuthStatusTable() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Complete Auth Status Table (Past 14 Days)    ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  try {
    // Read all unique_orders_status data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1:AN10000`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('❌ No data found');
      return;
    }

    const headers = rows[0];
    const createdAtIdx = headers.indexOf('created_at_iso');
    const facilityIdx = headers.indexOf('org_id');
    const authStatusIdx = headers.indexOf('auth_status');

    // Calculate date range (past 14 days)
    const today = new Date();
    const startDate = subDays(today, 14);
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    console.log(`📅 Date Range: ${startDateStr} to ${todayStr}`);
    console.log(`📊 Total Rows: ${rows.length - 1}\n`);

    // Filter rows to past 14 days
    const recentRows = rows.slice(1).filter(row => {
      const createdAt = row[createdAtIdx];
      if (!createdAt) return false;
      const orderDate = createdAt.split('T')[0].split(' ')[0];
      return orderDate >= startDateStr && orderDate <= todayStr;
    });

    console.log(`✅ Orders in Past 14 Days: ${recentRows.length}\n`);

    // Count auth_status across all facilities
    const statusCounts = new Map<string, number>();
    const facilityStatusCounts = new Map<string, Map<string, number>>();

    // Map facility IDs to names
    const facilityNameMap = new Map<string, string>();
    ORGANIZATIONS.forEach(org => {
      facilityNameMap.set(org.facilityId, org.name);
    });

    recentRows.forEach(row => {
      const facilityId = row[facilityIdx];
      const authStatus = row[authStatusIdx] || '(empty)';

      // Global count
      statusCounts.set(authStatus, (statusCounts.get(authStatus) || 0) + 1);

      // Per-facility count
      if (!facilityStatusCounts.has(facilityId)) {
        facilityStatusCounts.set(facilityId, new Map());
      }
      const facilityMap = facilityStatusCounts.get(facilityId)!;
      facilityMap.set(authStatus, (facilityMap.get(authStatus) || 0) + 1);
    });

    const totalOrders = recentRows.length;

    // Sort by total count (descending)
    const sortedStatuses = Array.from(statusCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('═══════════════════════════════════════════════════════════════════════════════════════');
    console.log('ALL 26 UNIQUE AUTH_STATUS VALUES (COMPLETE TABLE):');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

    // Header
    console.log('┌────┬─────────────────────────────┬─────────┬──────────┬───────────────────────────────────────────┐');
    console.log('│ #  │ auth_status                 │ Count   │ %        │ Facility Breakdown                        │');
    console.log('├────┼─────────────────────────────┼─────────┼──────────┼───────────────────────────────────────────┤');

    // Rows
    sortedStatuses.forEach(([status, count], idx) => {
      const percentage = ((count / totalOrders) * 100).toFixed(2);

      // Build facility breakdown string
      const facilityBreakdown: string[] = [];
      facilityStatusCounts.forEach((statusMap, facilityId) => {
        const facilityCount = statusMap.get(status);
        if (facilityCount && facilityCount > 0) {
          const facilityName = facilityNameMap.get(facilityId) || 'Unknown';
          facilityBreakdown.push(`${facilityName}:${facilityCount}`);
        }
      });

      const breakdownStr = facilityBreakdown.join(', ');
      const statusDisplay = status.padEnd(27);
      const countDisplay = count.toString().padStart(7);
      const pctDisplay = `${percentage}%`.padStart(8);

      console.log(`│ ${(idx + 1).toString().padStart(2)} │ ${statusDisplay} │ ${countDisplay} │ ${pctDisplay} │ ${breakdownStr.substring(0, 41).padEnd(41)} │`);
    });

    console.log('└────┴─────────────────────────────┴─────────┴──────────┴───────────────────────────────────────────┘');

    console.log(`\n📊 Summary:`);
    console.log(`   Total Unique Auth Statuses: ${sortedStatuses.length}`);
    console.log(`   Total Orders: ${totalOrders}`);
    console.log(`   Facilities Analyzed: ${facilityStatusCounts.size}\n`);

    console.log('═══════════════════════════════════════════════════════════════════════════════════════');
    console.log('FULL FACILITY BREAKDOWN FOR EACH STATUS:');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

    sortedStatuses.forEach(([status, totalCount]) => {
      console.log(`\n🔹 ${status} (Total: ${totalCount})`);

      const facilities: Array<{name: string, count: number, pct: number}> = [];
      facilityStatusCounts.forEach((statusMap, facilityId) => {
        const count = statusMap.get(status) || 0;
        if (count > 0) {
          const facilityName = facilityNameMap.get(facilityId) || 'Unknown';
          const pct = (count / totalCount) * 100;
          facilities.push({ name: facilityName, count, pct });
        }
      });

      facilities.sort((a, b) => b.count - a.count);
      facilities.forEach(f => {
        console.log(`   ${f.name.padEnd(15)}: ${f.count.toString().padStart(5)} orders (${f.pct.toFixed(1)}% of this status)`);
      });
    });

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}
