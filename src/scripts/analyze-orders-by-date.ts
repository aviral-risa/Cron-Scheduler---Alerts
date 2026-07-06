/**
 * Analyze orders by date from Jan 1 to today
 * Shows total orders, worked orders, and status breakdown
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { format, parseISO } from 'date-fns';

async function analyzeOrdersByDate() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  ORDERS ANALYSIS BY DATE (JAN 1 - TODAY)      ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Read all orders
  console.log('📖 Reading orders data...\n');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];
  const headers = rows[0];
  const dataRows = rows.slice(1);

  console.log(`Total orders in sheet: ${dataRows.length}\n`);

  // Column indices
  const orderIdIndex = 0;
  const createdAtIndex = 1; // created_at_iso
  const assignedToIndex = 3; // assigned_to_name
  const dateOfServiceIndex = 6; // date_of_service_iso
  const masterAuthStatusIndex = 13; // master_auth_status
  const medicalOrderStatusIndex = 18; // medical_order_status

  // Analyze by date of service (DOS)
  const dateStats = new Map<string, {
    total: number;
    worked: number;
    unassigned: number;
    authorized: number;
    denied: number;
    pending: number;
  }>();

  for (const row of dataRows) {
    const orderId = row[orderIdIndex];
    const createdAt = row[createdAtIndex] || '';
    const assignedTo = row[assignedToIndex] || 'unassigned';
    const dateOfService = row[dateOfServiceIndex] || '';
    const authStatus = row[masterAuthStatusIndex] || '';
    const orderStatus = row[medicalOrderStatusIndex] || '';

    if (!orderId || !dateOfService) continue;

    // Parse date of service (format: MM/DD/YYYY)
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

    // Filter for Jan 1, 2026 onwards
    if (dosDate < '2026-01-01') continue;

    // Initialize stats for this date
    if (!dateStats.has(dosDate)) {
      dateStats.set(dosDate, {
        total: 0,
        worked: 0,
        unassigned: 0,
        authorized: 0,
        denied: 0,
        pending: 0,
      });
    }

    const stats = dateStats.get(dosDate)!;
    stats.total++;

    // Check if worked (assigned to someone)
    if (assignedTo.toLowerCase() !== 'unassigned' && assignedTo.trim() !== '') {
      stats.worked++;
    } else {
      stats.unassigned++;
    }

    // Auth status breakdown
    const authLower = authStatus.toLowerCase();
    if (authLower.includes('authorized') || authLower.includes('no_auth_required')) {
      stats.authorized++;
    } else if (authLower.includes('denied') || authLower.includes('rejected')) {
      stats.denied++;
    } else if (authLower.includes('required') || authLower.includes('pending') || authLower === 'auth mate') {
      stats.pending++;
    }
  }

  // Sort dates
  const sortedDates = Array.from(dateStats.keys()).sort();

  // Print summary table
  console.log('═'.repeat(100));
  console.log('Date       │ Total │ Worked │ Unassigned │ Authorized │ Denied │ Pending │ Work %');
  console.log('═'.repeat(100));

  let grandTotal = 0;
  let grandWorked = 0;
  let grandUnassigned = 0;
  let grandAuthorized = 0;
  let grandDenied = 0;
  let grandPending = 0;

  for (const date of sortedDates) {
    const stats = dateStats.get(date)!;
    const workPct = ((stats.worked / stats.total) * 100).toFixed(1);

    console.log(
      `${date} │ ${stats.total.toString().padStart(5)} │ ` +
      `${stats.worked.toString().padStart(6)} │ ` +
      `${stats.unassigned.toString().padStart(10)} │ ` +
      `${stats.authorized.toString().padStart(10)} │ ` +
      `${stats.denied.toString().padStart(6)} │ ` +
      `${stats.pending.toString().padStart(7)} │ ` +
      `${workPct.padStart(5)}%`
    );

    grandTotal += stats.total;
    grandWorked += stats.worked;
    grandUnassigned += stats.unassigned;
    grandAuthorized += stats.authorized;
    grandDenied += stats.denied;
    grandPending += stats.pending;
  }

  console.log('═'.repeat(100));
  const grandWorkPct = ((grandWorked / grandTotal) * 100).toFixed(1);
  console.log(
    `${'TOTAL'.padEnd(11)} │ ${grandTotal.toString().padStart(5)} │ ` +
    `${grandWorked.toString().padStart(6)} │ ` +
    `${grandUnassigned.toString().padStart(10)} │ ` +
    `${grandAuthorized.toString().padStart(10)} │ ` +
    `${grandDenied.toString().padStart(6)} │ ` +
    `${grandPending.toString().padStart(7)} │ ` +
    `${grandWorkPct.padStart(5)}%`
  );
  console.log('═'.repeat(100));

  console.log('\n📊 SUMMARY:');
  console.log(`   Total orders (Jan 1 - Today):  ${grandTotal.toLocaleString()}`);
  console.log(`   Worked orders:                 ${grandWorked.toLocaleString()} (${grandWorkPct}%)`);
  console.log(`   Unassigned orders:             ${grandUnassigned.toLocaleString()}`);
  console.log(`   Authorized:                    ${grandAuthorized.toLocaleString()}`);
  console.log(`   Denied:                        ${grandDenied.toLocaleString()}`);
  console.log(`   Pending auth:                  ${grandPending.toLocaleString()}`);
  console.log('');
}

analyzeOrdersByDate().catch(console.error);
