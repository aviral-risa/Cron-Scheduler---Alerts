/**
 * Inspect unique_orders_status Field Values
 *
 * Shows actual values for key fields to understand correct calculation logic
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function inspectUniqueOrdersFields() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Inspect unique_orders_status Fields          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  try {
    // Read header row to get column names
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1:AN1`,
    });

    const headers = headerResponse.data.values?.[0] || [];
    console.log(`📋 Total Columns: ${headers.length}\n`);

    // Read sample data (50 rows)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A2:AN50`,
    });

    const rows = response.data.values || [];
    console.log(`📊 Sample Size: ${rows.length} rows\n`);

    // Key field indices
    const medicalOrderStatusIdx = headers.indexOf('medical_order_status');
    const authStatusIdx = headers.indexOf('auth_status');
    const masterAuthStatusIdx = headers.indexOf('master_auth_status');
    const markAsCompletedIdx = headers.indexOf('mark_as_completed');
    const createdAtIdx = headers.indexOf('created_at_iso');

    console.log('Column Indices:');
    console.log(`  medical_order_status: Column ${String.fromCharCode(65 + medicalOrderStatusIdx)} (index ${medicalOrderStatusIdx})`);
    console.log(`  auth_status: Column ${String.fromCharCode(65 + authStatusIdx)} (index ${authStatusIdx})`);
    console.log(`  master_auth_status: Column ${String.fromCharCode(65 + masterAuthStatusIdx)} (index ${masterAuthStatusIdx})`);
    console.log(`  mark_as_completed: Column ${String.fromCharCode(65 + markAsCompletedIdx)} (index ${markAsCompletedIdx})\n`);

    // Collect unique values
    const medicalOrderStatuses = new Set<string>();
    const authStatuses = new Set<string>();
    const masterAuthStatuses = new Set<string>();
    const markAsCompletedValues = new Set<string>();

    rows.forEach(row => {
      if (row[medicalOrderStatusIdx]) medicalOrderStatuses.add(row[medicalOrderStatusIdx]);
      if (row[authStatusIdx]) authStatuses.add(row[authStatusIdx]);
      if (row[masterAuthStatusIdx]) masterAuthStatuses.add(row[masterAuthStatusIdx]);
      if (row[markAsCompletedIdx]) markAsCompletedValues.add(row[markAsCompletedIdx]);
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('UNIQUE VALUES FOUND:');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🔹 medical_order_status (Unique Values):');
    if (medicalOrderStatuses.size > 0) {
      Array.from(medicalOrderStatuses).sort().forEach(val => {
        const count = rows.filter(r => r[medicalOrderStatusIdx] === val).length;
        console.log(`   - "${val}" (${count} orders)`);
      });
    } else {
      console.log('   (empty or null)');
    }

    console.log('\n🔹 auth_status (Unique Values):');
    if (authStatuses.size > 0) {
      Array.from(authStatuses).sort().forEach(val => {
        const count = rows.filter(r => r[authStatusIdx] === val).length;
        console.log(`   - "${val}" (${count} orders)`);
      });
    } else {
      console.log('   (empty or null)');
    }

    console.log('\n🔹 master_auth_status (Unique Values):');
    if (masterAuthStatuses.size > 0) {
      Array.from(masterAuthStatuses).sort().forEach(val => {
        const count = rows.filter(r => r[masterAuthStatusIdx] === val).length;
        console.log(`   - "${val}" (${count} orders)`);
      });
    } else {
      console.log('   (empty or null)');
    }

    console.log('\n🔹 mark_as_completed (Unique Values):');
    if (markAsCompletedValues.size > 0) {
      Array.from(markAsCompletedValues).sort().forEach(val => {
        const count = rows.filter(r => r[markAsCompletedIdx] === val).length;
        console.log(`   - "${val}" (${count} orders)`);
      });
    } else {
      console.log('   (empty or null)');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SAMPLE ROWS (First 5):');
    console.log('═══════════════════════════════════════════════════════\n');

    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      console.log(`Row ${i + 1}:`);
      console.log(`  created_at: ${row[createdAtIdx]?.substring(0, 10)}`);
      console.log(`  medical_order_status: "${row[medicalOrderStatusIdx] || '(empty)'}"`);
      console.log(`  auth_status: "${row[authStatusIdx] || '(empty)'}"`);
      console.log(`  master_auth_status: "${row[masterAuthStatusIdx] || '(empty)'}"`);
      console.log(`  mark_as_completed: "${row[markAsCompletedIdx] || '(empty)'}"`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error inspecting data:', error);
  }
}
