/**
 * Verify Person Queue Data in Google Sheets
 *
 * This script reads the last 20 rows from the person_level_queues sheet
 * to verify that data is being written correctly.
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials from .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SHEET_NAME = 'person_level_queues';

async function verifySheetData() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      Verifying Person Queue Data in Google Sheets             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.VITE_GOOGLE_SHEETS_ID;

    console.log(`Reading from sheet: ${SHEET_NAME}`);
    console.log(`Spreadsheet ID: ${spreadsheetId}\n`);

    // Read all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:L`,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log('⚠ No data found in the person_level_queues sheet.');
      console.log('  This could mean:');
      console.log('  - The sheet is truly empty');
      console.log('  - The sheet name is incorrect');
      console.log('  - There are permission issues\n');
      return;
    }

    console.log(`✓ Found ${rows.length} rows in the sheet\n`);

    // Display header
    const header = rows[0];
    console.log('Header Row:');
    console.log(`  ${header.join(' | ')}\n`);

    // Display last 10 rows
    const dataRows = rows.slice(1); // Skip header
    const recentRows = dataRows.slice(-10); // Last 10 rows

    console.log(`Last ${recentRows.length} Data Rows:`);
    console.log('═'.repeat(120));

    recentRows.forEach((row, idx) => {
      const rowNum = dataRows.length - recentRows.length + idx + 2; // +2 for header and 1-indexing
      const [timestamp, date, hour, name, personId, facilityId, newCount, pending, query, hold, authReq, total] = row;

      console.log(`Row ${rowNum}: ${timestamp} | ${name} | Facility: ${facilityId}`);
      console.log(`         New: ${newCount}, Pending: ${pending}, Query: ${query}, Hold: ${hold}, AuthReq: ${authReq}, Total: ${total}`);
    });

    console.log('═'.repeat(120));

    // Calculate summary statistics
    const totalRows = dataRows.length;
    const uniqueTimestamps = new Set(dataRows.map(row => row[0])).size;
    const uniquePeople = new Set(dataRows.map(row => row[3])).size;

    console.log('\n📊 Summary Statistics:');
    console.log(`  - Total data rows: ${totalRows}`);
    console.log(`  - Unique timestamps: ${uniqueTimestamps}`);
    console.log(`  - Unique people: ${uniquePeople}`);

    // Check if recent rows have any non-zero values
    const hasNonZeroData = recentRows.some(row => {
      const [, , , , , , newCount, pending, query, hold, authReq] = row;
      return parseInt(newCount || 0) > 0 ||
             parseInt(pending || 0) > 0 ||
             parseInt(query || 0) > 0 ||
             parseInt(hold || 0) > 0 ||
             parseInt(authReq || 0) > 0;
    });

    if (hasNonZeroData) {
      console.log('\n✓ Recent data includes non-zero queue counts - team members have assigned orders');
    } else {
      console.log('\n⚠ All recent rows show zero queue counts');
      console.log('  This means team members currently have no assigned orders in Algolia');
      console.log('  This is normal if orders are not assigned yet or have been completed');
    }

    console.log('\n✓ Sheet verification complete!\n');

  } catch (error) {
    console.error('\n✗ Error verifying sheet data:', error.message);
    if (error.code === 404) {
      console.error('  The sheet or spreadsheet was not found.');
    } else if (error.code === 403) {
      console.error('  Permission denied. Check service account access.');
    }
    console.error(error);
  }
}

// Run verification
verifySheetData();
