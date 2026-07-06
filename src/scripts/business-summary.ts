/**
 * Generate comprehensive business summary
 * Shows key metrics, trends, and performance analysis
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { format, parseISO, startOfWeek, differenceInDays } from 'date-fns';

async function generateBusinessSummary() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          BUSINESS SUMMARY REPORT               ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Read all orders
  console.log('📖 Loading orders data...\n');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1);

  // Column indices
  const createdAtIndex = 1;
  const assignedToIndex = 3;
  const primaryPayerIndex = 4;
  const dateOfServiceIndex = 6;
  const orgIdIndex = 7;
  const masterAuthStatusIndex = 13;
  const authStatusIndex = 17;
  const medicalOrderStatusIndex = 18;
  const regimenTypeIndex = 19;

  // Initialize metrics
  let totalOrders = 0;
  let workedOrders = 0;
  let unassignedOrders = 0;
  let authorizedOrders = 0;
  let deniedOrders = 0;
  let pendingAuthOrders = 0;

  const payerBreakdown = new Map<string, number>();
  const orgBreakdown = new Map<string, number>();
  const regimenBreakdown = new Map<string, number>();
  const assigneeBreakdown = new Map<string, number>();
  const weeklyOrders = new Map<string, number>();

  let jan2026Orders = 0;
  let feb2026Orders = 0;
  let mar2026Orders = 0;

  // Analyze each order
  for (const row of dataRows) {
    const createdAt = row[createdAtIndex] || '';
    const assignedTo = row[assignedToIndex] || 'unassigned';
    const payer = row[primaryPayerIndex] || 'Unknown';
    const dateOfService = row[dateOfServiceIndex] || '';
    const orgId = row[orgIdIndex] || 'Unknown';
    const masterAuthStatus = row[masterAuthStatusIndex] || '';
    const authStatus = row[authStatusIndex] || '';
    const orderStatus = row[medicalOrderStatusIndex] || '';
    const regimenType = row[regimenTypeIndex] || 'Unknown';

    if (!dateOfService) continue;

    totalOrders++;

    // Parse date of service
    let dosDate: string;
    try {
      const parts = dateOfService.split('/');
      if (parts.length === 3) {
        dosDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      } else {
        continue;
      }
    } catch {
      continue;
    }

    // Filter for 2026 only
    if (!dosDate.startsWith('2026')) continue;

    // Month breakdown
    if (dosDate.startsWith('2026-01')) jan2026Orders++;
    else if (dosDate.startsWith('2026-02')) feb2026Orders++;
    else if (dosDate.startsWith('2026-03')) mar2026Orders++;

    // Week breakdown
    const weekKey = dosDate.substring(0, 7); // YYYY-MM
    weeklyOrders.set(weekKey, (weeklyOrders.get(weekKey) || 0) + 1);

    // Assignment status
    if (assignedTo.toLowerCase() !== 'unassigned' && assignedTo.trim() !== '') {
      workedOrders++;
      assigneeBreakdown.set(assignedTo, (assigneeBreakdown.get(assignedTo) || 0) + 1);
    } else {
      unassignedOrders++;
    }

    // Auth status
    const authLower = masterAuthStatus.toLowerCase();
    if (authLower.includes('authorized') || authLower.includes('no_auth_required')) {
      authorizedOrders++;
    } else if (authLower.includes('denied') || authLower.includes('rejected')) {
      deniedOrders++;
    } else if (authLower.includes('required') || authLower.includes('pending') || authLower === 'auth mate') {
      pendingAuthOrders++;
    }

    // Payer breakdown
    payerBreakdown.set(payer, (payerBreakdown.get(payer) || 0) + 1);

    // Org breakdown
    orgBreakdown.set(orgId, (orgBreakdown.get(orgId) || 0) + 1);

    // Regimen type breakdown
    regimenBreakdown.set(regimenType, (regimenBreakdown.get(regimenType) || 0) + 1);
  }

  // Calculate percentages
  const workedPct = ((workedOrders / totalOrders) * 100).toFixed(1);
  const authorizedPct = ((authorizedOrders / totalOrders) * 100).toFixed(1);
  const deniedPct = ((deniedOrders / totalOrders) * 100).toFixed(1);
  const pendingPct = ((pendingAuthOrders / totalOrders) * 100).toFixed(1);

  // Print Summary
  console.log('═'.repeat(80));
  console.log('📊 OVERALL METRICS (2026)');
  console.log('═'.repeat(80));
  console.log(`Total Orders:              ${totalOrders.toLocaleString()}`);
  console.log(`Worked Orders:             ${workedOrders.toLocaleString()} (${workedPct}%)`);
  console.log(`Unassigned Orders:         ${unassignedOrders.toLocaleString()} (${(100 - parseFloat(workedPct)).toFixed(1)}%)`);
  console.log('');
  console.log(`Authorized:                ${authorizedOrders.toLocaleString()} (${authorizedPct}%)`);
  console.log(`Denied:                    ${deniedOrders.toLocaleString()} (${deniedPct}%)`);
  console.log(`Pending Authorization:     ${pendingAuthOrders.toLocaleString()} (${pendingPct}%)`);
  console.log('');

  // Monthly breakdown
  console.log('═'.repeat(80));
  console.log('📅 MONTHLY BREAKDOWN');
  console.log('═'.repeat(80));
  console.log(`January 2026:              ${jan2026Orders.toLocaleString()} orders`);
  console.log(`February 2026:             ${feb2026Orders.toLocaleString()} orders`);
  console.log(`March 2026 (partial):      ${mar2026Orders.toLocaleString()} orders`);
  console.log('');

  // Top payers
  console.log('═'.repeat(80));
  console.log('💰 TOP 10 PAYERS');
  console.log('═'.repeat(80));
  const topPayers = Array.from(payerBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topPayers.forEach(([payer, count], idx) => {
    const pct = ((count / totalOrders) * 100).toFixed(1);
    console.log(`${(idx + 1).toString().padStart(2)}. ${payer.padEnd(50)} ${count.toString().padStart(6)} (${pct}%)`);
  });
  console.log('');

  // Top assignees
  console.log('═'.repeat(80));
  console.log('👥 TOP 10 ASSIGNEES (BY ORDERS WORKED)');
  console.log('═'.repeat(80));
  const topAssignees = Array.from(assigneeBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topAssignees.forEach(([assignee, count], idx) => {
    const pct = ((count / workedOrders) * 100).toFixed(1);
    console.log(`${(idx + 1).toString().padStart(2)}. ${assignee.padEnd(30)} ${count.toString().padStart(6)} orders (${pct}% of worked)`);
  });
  console.log('');

  // Top regimen types
  console.log('═'.repeat(80));
  console.log('💊 TOP 10 REGIMEN TYPES');
  console.log('═'.repeat(80));
  const topRegimens = Array.from(regimenBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topRegimens.forEach(([regimen, count], idx) => {
    const pct = ((count / totalOrders) * 100).toFixed(1);
    const displayRegimen = regimen === 'single_agent' ? 'Single Agent' :
                           regimen === 'multi_agent' ? 'Multi Agent' :
                           regimen === 'Unknown' ? 'Unknown' : regimen;
    console.log(`${(idx + 1).toString().padStart(2)}. ${displayRegimen.padEnd(30)} ${count.toString().padStart(6)} (${pct}%)`);
  });
  console.log('');

  // Key insights
  console.log('═'.repeat(80));
  console.log('💡 KEY INSIGHTS');
  console.log('═'.repeat(80));

  const avgOrdersPerDay = Math.round(totalOrders / 66); // Jan 5 to Mar 11 = ~66 days
  console.log(`• Average orders per day: ${avgOrdersPerDay.toLocaleString()}`);

  const authSuccessRate = ((authorizedOrders / (authorizedOrders + deniedOrders)) * 100).toFixed(1);
  console.log(`• Authorization success rate: ${authSuccessRate}% (${authorizedOrders.toLocaleString()} approved / ${deniedOrders.toLocaleString()} denied)`);

  const workloadBalance = topAssignees[0] ?
    `${topAssignees[0][0]} (${topAssignees[0][1]} orders)` : 'N/A';
  console.log(`• Top performer: ${workloadBalance}`);

  const multiAgent = regimenBreakdown.get('multi_agent') || 0;
  const singleAgent = regimenBreakdown.get('single_agent') || 0;
  const multiAgentPct = ((multiAgent / (multiAgent + singleAgent)) * 100).toFixed(1);
  console.log(`• Multi-agent regimens: ${multiAgentPct}% (${multiAgent.toLocaleString()} of ${(multiAgent + singleAgent).toLocaleString()})`);

  console.log('');
  console.log('═'.repeat(80));
  console.log('✅ Report generated successfully');
  console.log('═'.repeat(80));
  console.log('');
}

generateBusinessSummary().catch(console.error);
