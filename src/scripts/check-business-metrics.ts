/**
 * Check business_metrics_daily Data
 *
 * Displays the current data in the business_metrics_daily sheet
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function checkBusinessMetrics() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Check business_metrics_daily Data            ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A1:V10`,
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log('❌ No data found in business_metrics_daily sheet');
      return;
    }

    const headers = rows[0];
    console.log('📋 Column Headers (22 columns):');
    console.log(headers.slice(0, 6).join(' | '));
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('DATA ROWS:');
    console.log('═══════════════════════════════════════════════════════\n');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      console.log(`Row ${i}: ${row[0]} | ${row[1]}`);
      console.log(`  Total Orders: ${row[2]}`);
      console.log(`  Orders Assigned: ${row[3]}`);
      console.log(`  Orders Completed: ${row[4]}`);
      console.log(`  Orders In Progress: ${row[5]}`);
      console.log(`  Status Counts:`);
      console.log(`    - auth_by_risa: ${row[6]}`);
      console.log(`    - auth_on_file: ${row[7]}`);
      console.log(`    - no_auth_required: ${row[8]}`);
      console.log(`    - denial_by_risa: ${row[9]}`);
      console.log(`    - denial_after_query: ${row[10]}`);
      console.log(`  Rates:`);
      console.log(`    - Approval Rate: ${row[16]}%`);
      console.log(`    - Authorization Rate: ${row[17]}%`);
      console.log(`    - Order Completion: ${row[18]}%`);
      console.log(`    - Order In Progress: ${row[19]}%`);
      console.log(`  Last Updated: ${row[20]}`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Found ${rows.length - 1} data rows`);
    console.log(`\nView sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}\n`);

  } catch (error) {
    console.error('❌ Error reading business_metrics_daily:', error);
  }
}
