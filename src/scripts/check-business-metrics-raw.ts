/**
 * Check business_metrics_daily Raw Data
 *
 * Shows the raw column values to verify correct data storage
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

export async function checkBusinessMetricsRaw() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Check business_metrics_daily Raw Data        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  try {
    // Read header row
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A1:V1`,
    });

    const headers = headerResponse.data.values?.[0] || [];

    // Read all data rows first to find NYCBS
    const allDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A2:V10`,
    });

    const allRows = allDataResponse.data.values || [];
    const nycbsRow = allRows.find(row => row[1] === 'HhwIHO4npKhrxyylkC33');

    if (!nycbsRow) {
      console.log('❌ NYCBS row not found');
      return;
    }

    const row = nycbsRow;

    console.log('NYCBS Row (2026-02-03 | HhwIHO4npKhrxyylkC33):');
    console.log('═══════════════════════════════════════════════════════\n');

    for (let i = 0; i < Math.min(headers.length, row.length); i++) {
      console.log(`[${i}] ${headers[i]}: ${row[i]}`);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Raw data check complete\n');

  } catch (error) {
    console.error('❌ Error reading data:', error);
  }
}
