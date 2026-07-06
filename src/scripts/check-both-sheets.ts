import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function checkBoth() {
  const sheets = getSheetsClient();
  const archiveId = getSpreadsheetId('archive');
  const mainId = getSpreadsheetId('unique_status');

  console.log('\n📊 Checking both sheets...\n');

  // Check main sheet
  console.log('Main sheet (unique_orders_status):');
  const mainData = await sheets.spreadsheets.values.get({
    spreadsheetId: mainId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:A`,
  });
  const mainRows = (mainData.data.values || []).length - 1; // Exclude header
  console.log(`   Orders: ${mainRows}\n`);

  // Check archive sheet
  console.log('Archive sheet (unique_orders_archive):');
  const archiveData = await sheets.spreadsheets.values.get({
    spreadsheetId: archiveId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A:A`,
  });
  const archiveRows = (archiveData.data.values || []).length - 1; // Exclude header
  console.log(`   Orders: ${archiveRows}\n`);

  console.log(`Total: ${mainRows + archiveRows} orders\n`);
}

checkBoth().catch(console.error);
