import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function restore() {
  const sheets = getSheetsClient();
  const archiveId = getSpreadsheetId('archive');
  const mainId = getSpreadsheetId('unique_status');

  console.log('\n📖 Reading from archive...');
  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: archiveId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_ARCHIVE}!A2:AQ`,
  });

  const rows = data.data.values || [];
  console.log(`   Found ${rows.length} orders in archive\n`);

  if (rows.length === 0) {
    console.log('✅ Archive is empty, nothing to restore\n');
    return;
  }

  console.log('📝 Restoring to main sheet in batches...');
  const BATCH = 5000;
  let written = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sheets.spreadsheets.values.append({
      spreadsheetId: mainId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: batch },
    });
    written += batch.length;
    console.log(`   Wrote ${written}/${rows.length} orders`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Restored ${rows.length} orders!\n`);
}

restore().catch(console.error);
