import 'dotenv/config';
import { google } from 'googleapis';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return process.env[key];
};

const SHEETS_ID = getEnv('VITE_GOOGLE_SHEETS_ID');

/**
 * View daily_summary sheet data
 */
async function viewDailySummary() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Fetching daily_summary data...\n');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: 'daily_summary!A:Q',
  });

  const rows = response.data.values || [];

  if (rows.length === 0) {
    console.log('No data found.');
    return;
  }

  const headers = rows[0];
  console.log('='.repeat(120));
  console.log('DAILY SUMMARY DATA');
  console.log('='.repeat(120));
  console.log();

  // Print data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Row ${i}:`);
    console.log(`  Date: ${row[0]}`);
    console.log(`  Facility: ${row[1]}`);
    console.log(`  Total Orders: ${row[2]}`);
    console.log(`  Orders Assigned: ${row[3]}`);
    console.log(`  Orders Completed: ${row[4]}`);
    console.log(`  Status Breakdown:`);
    console.log(`    - Auth by RISA: ${row[5]}`);
    console.log(`    - Auth on File: ${row[6]}`);
    console.log(`    - No Auth Required: ${row[7]}`);
    console.log(`    - Denial by RISA: ${row[8]}`);
    console.log(`    - Denial after Query: ${row[9]}`);
    console.log(`    - Existing Denial: ${row[10]}`);
    console.log(`    - Query: ${row[11]}`);
    console.log(`    - Pending: ${row[12]}`);
    console.log(`    - Hold: ${row[13]}`);
    console.log(`    - Auth Required: ${row[14]}`);
    console.log(`    - Other: ${row[15]}`);
    console.log(`  Last Updated: ${row[16]}`);
    console.log();
  }

  console.log('='.repeat(120));
  console.log(`Total rows: ${rows.length - 1}`);
}

viewDailySummary().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
