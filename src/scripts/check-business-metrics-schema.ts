import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function checkSchema() {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId('unique_status');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A1:Z1`
  });

  console.log('Current business_metrics_daily columns:');
  (response.data.values?.[0] || []).forEach((col, i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${col}`);
  });
}

checkSchema().catch(console.error);
