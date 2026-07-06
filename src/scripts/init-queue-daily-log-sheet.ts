/**
 * Initialize Queue Daily Log Sheet
 *
 * This script creates the 'queue_daily_log' sheet with proper headers
 * in the dedicated QUEUE spreadsheet.
 *
 * Run: npx ts-node src/scripts/init-queue-daily-log-sheet.ts
 */

import 'dotenv/config';
import { google } from 'googleapis';

// Queue spreadsheet ID
const QUEUE_SHEETS_ID = process.env.VITE_QUEUE_SHEETS_ID;

if (!QUEUE_SHEETS_ID) {
  console.error('❌ VITE_QUEUE_SHEETS_ID not found in environment variables');
  console.log('Please add the following to your .env file:');
  console.log('VITE_QUEUE_SHEETS_ID=your_queue_spreadsheet_id');
  process.exit(1);
}

const SHEET_NAME = 'queue_daily_log';

// Headers for the queue_daily_log sheet
const HEADERS = [
  'snapshot_timestamp',
  'snapshot_date',
  'snapshot_hour',
  'person_name',
  'person_id',
  'facility_id',
  'new',
  'pending',
  'query',
  'hold',
  'auth_required',
  'total_open_orders',
];

async function initQueueDailyLogSheet() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  QUEUE DAILY LOG SHEET INITIALIZATION                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Spreadsheet ID: ${QUEUE_SHEETS_ID}`);
  console.log(`Sheet Name: ${SHEET_NAME}`);
  console.log('');

  // Initialize Google Sheets API
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // 1. Check if spreadsheet exists and is accessible
    console.log('1. Verifying spreadsheet access...');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: QUEUE_SHEETS_ID,
    });
    console.log(`   ✅ Spreadsheet found: "${spreadsheet.data.properties?.title}"`);

    // 2. Check if sheet already exists
    console.log('');
    console.log('2. Checking for existing sheet...');
    const existingSheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME
    );

    if (existingSheet) {
      console.log(`   ⚠️  Sheet "${SHEET_NAME}" already exists (ID: ${existingSheet.properties?.sheetId})`);

      // Check if it has headers
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: QUEUE_SHEETS_ID,
        range: `${SHEET_NAME}!A1:L1`,
      });

      const existingHeaders = headerResponse.data.values?.[0] || [];

      if (existingHeaders.length === HEADERS.length) {
        console.log('   ✅ Sheet already has correct headers');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('✅ Queue daily log sheet is ready!');
        console.log('═══════════════════════════════════════════════════════════════');
        return;
      } else {
        console.log('   ⚠️  Headers missing or incomplete. Adding headers...');
      }
    } else {
      // 3. Create the sheet
      console.log('');
      console.log('3. Creating new sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: QUEUE_SHEETS_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME,
                },
              },
            },
          ],
        },
      });
      console.log(`   ✅ Sheet "${SHEET_NAME}" created`);
    }

    // 4. Add headers
    console.log('');
    console.log('4. Adding headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: QUEUE_SHEETS_ID,
      range: `${SHEET_NAME}!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [HEADERS],
      },
    });
    console.log('   ✅ Headers added:');
    HEADERS.forEach((header, idx) => {
      const col = String.fromCharCode(65 + idx);
      console.log(`      ${col}: ${header}`);
    });

    // 5. Format header row (bold, frozen)
    console.log('');
    console.log('5. Formatting header row...');

    // Get the sheet ID for the newly created sheet
    const updatedSpreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: QUEUE_SHEETS_ID,
    });
    const sheetId = updatedSpreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME
    )?.properties?.sheetId;

    if (sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: QUEUE_SHEETS_ID,
        requestBody: {
          requests: [
            // Bold header row
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true,
                    },
                    backgroundColor: {
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9,
                    },
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
            // Freeze header row
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
      console.log('   ✅ Header row formatted (bold, frozen)');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Queue daily log sheet initialized successfully!');
    console.log('');
    console.log('The sheet is ready to store permanent daily queue snapshots.');
    console.log('Data will be synced at 11:59 PM IST daily by the scheduler.');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error('');
    console.error('❌ Error initializing sheet:', error.message);

    if (error.message?.includes('not found')) {
      console.error('');
      console.error('The spreadsheet was not found. Please check:');
      console.error('1. The VITE_QUEUE_SHEETS_ID is correct');
      console.error('2. The service account has been shared with the spreadsheet');
    }

    process.exit(1);
  }
}

// Run the script
initQueueDailyLogSheet();
