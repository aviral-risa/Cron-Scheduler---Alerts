import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

async function showSample() {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId('unique_status');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A1:X10`
  });

  const rows = response.data.values || [];
  console.log('\n📊 Sample of recalculated business metrics (first 9 rows):\n');

  rows.forEach((row, i) => {
    if (i === 0) {
      console.log('Date       | Facility             | Total | Assigned | Completed | Billable');
      console.log('─'.repeat(80));
    } else {
      const date = row[0];
      const facility = (row[1] || '').substring(0, 20).padEnd(20);
      const total = (row[2] || '0').toString().padStart(5);
      const assigned = (row[3] || '0').toString().padStart(8);
      const completed = (row[4] || '0').toString().padStart(9);
      const billable = (row[6] || '0').toString().padStart(8);
      console.log(`${date} | ${facility} | ${total} | ${assigned} | ${completed} | ${billable}`);
    }
  });
  console.log('');
}

showSample().catch(console.error);
