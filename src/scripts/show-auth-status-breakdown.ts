/**
 * Show Auth Status Breakdown by Facility (Past 14 Days)
 *
 * Analyzes unique_orders_status data for the past 14 days and shows
 * auth_status distribution by facility
 */

import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { ORGANIZATIONS } from '../config/organizations';

export async function showAuthStatusBreakdown() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Auth Status Breakdown (Past 14 Days)         ║');
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
    const medicalOrderStatusIdx = headers.indexOf('medical_order_status');

    console.log(`📊 Analyzing ${rows.length - 1} total rows...\n`);

    // Calculate date range (past 14 days)
    const today = new Date();
    const startDate = subDays(today, 14);
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    console.log(`Date Range: ${startDateStr} to ${todayStr}\n`);

    // Filter rows to past 14 days
    const recentRows = rows.slice(1).filter(row => {
      const createdAt = row[createdAtIdx];
      if (!createdAt) return false;
      const orderDate = createdAt.split('T')[0].split(' ')[0];
      return orderDate >= startDateStr && orderDate <= todayStr;
    });

    console.log(`📈 Found ${recentRows.length} orders in past 14 days\n`);

    // Group by facility and auth_status
    const facilityMap = new Map<string, Map<string, number>>();

    recentRows.forEach(row => {
      const facilityId = row[facilityIdx];
      const authStatus = row[authStatusIdx] || '(empty)';

      if (!facilityMap.has(facilityId)) {
        facilityMap.set(facilityId, new Map());
      }

      const statusMap = facilityMap.get(facilityId)!;
      statusMap.set(authStatus, (statusMap.get(authStatus) || 0) + 1);
    });

    // Display results
    console.log('═══════════════════════════════════════════════════════');
    console.log('AUTH_STATUS BREAKDOWN BY FACILITY:');
    console.log('═══════════════════════════════════════════════════════\n');

    // Map facility IDs to names
    const facilityNameMap = new Map<string, string>();
    ORGANIZATIONS.forEach(org => {
      facilityNameMap.set(org.facilityId, org.name);
    });

    facilityMap.forEach((statusMap, facilityId) => {
      const facilityName = facilityNameMap.get(facilityId) || 'Unknown';
      const totalOrders = Array.from(statusMap.values()).reduce((sum, count) => sum + count, 0);

      console.log(`\n🏥 ${facilityName} (${facilityId})`);
      console.log(`   Total Orders: ${totalOrders}\n`);
      console.log('   Auth Status Distribution:');

      // Sort by count (descending)
      const sortedStatuses = Array.from(statusMap.entries())
        .sort((a, b) => b[1] - a[1]);

      sortedStatuses.forEach(([status, count]) => {
        const percentage = ((count / totalOrders) * 100).toFixed(1);
        console.log(`     - ${status}: ${count} (${percentage}%)`);
      });
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('ALL UNIQUE AUTH_STATUS VALUES (Across All Facilities):');
    console.log('═══════════════════════════════════════════════════════\n');

    const allStatuses = new Set<string>();
    facilityMap.forEach(statusMap => {
      statusMap.forEach((_, status) => allStatuses.add(status));
    });

    Array.from(allStatuses).sort().forEach(status => {
      console.log(`  - ${status}`);
    });

    console.log(`\nTotal Unique Auth Statuses: ${allStatuses.size}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}
