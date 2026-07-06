#!/usr/bin/env tsx
/**
 * Setup Test Google Sheet
 *
 * Creates the necessary tabs and headers in the test Google Sheet
 */

import { google } from 'googleapis';
import { TEST_SHEET_CONFIG } from '../config/test-sheet.config';
import { createLogger } from '../utils/logger';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Setup');

/**
 * Get environment variable helper
 */
const getEnv = (key: string) => {
  return process.env[key];
};

/**
 * Initialize Google Sheets API client
 */
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Check if a sheet tab exists
 */
async function sheetExists(sheets: any, sheetName: string): Promise<boolean> {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: TEST_SHEET_CONFIG.SHEET_ID,
    });

    const sheetExists = response.data.sheets?.some(
      (sheet: any) => sheet.properties.title === sheetName
    );

    return !!sheetExists;
  } catch (error) {
    return false;
  }
}

/**
 * Create a new sheet tab
 */
async function createSheetTab(sheets: any, sheetName: string): Promise<void> {
  logger.info(`Creating sheet tab: ${sheetName}...`);

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: TEST_SHEET_CONFIG.SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    });

    logger.success(`Created sheet tab: ${sheetName}`);
  } catch (error: any) {
    logger.error(`Failed to create sheet tab: ${sheetName}`, error.message);
    throw error;
  }
}

/**
 * Write headers to a sheet
 */
async function writeHeaders(sheets: any, sheetName: string, headers: string[]): Promise<void> {
  logger.info(`Writing headers to ${sheetName}...`);

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: TEST_SHEET_CONFIG.SHEET_ID,
      range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    logger.success(`Headers written to ${sheetName}`);
  } catch (error: any) {
    logger.error(`Failed to write headers to ${sheetName}`, error.message);
    throw error;
  }
}

/**
 * Main setup function
 */
async function main() {
  try {
    logger.header('Test Google Sheet Setup');
    logger.info(`Sheet ID: ${TEST_SHEET_CONFIG.SHEET_ID}`);
    logger.blank();

    const sheets = getSheetsClient();

    // Setup orders_raw_hourly tab
    const sheetName = TEST_SHEET_CONFIG.SHEET_NAMES.RAW_HOURLY;
    logger.info(`Checking if ${sheetName} exists...`);

    const exists = await sheetExists(sheets, sheetName);

    if (!exists) {
      await createSheetTab(sheets, sheetName);
    } else {
      logger.info(`${sheetName} already exists`);
    }

    // Write headers
    const headers = [
      'snapshot_timestamp',
      'snapshot_hour_ist',
      'order_id',
      'facility_id',
      'provider_name',
      'master_auth_status',
      'created_at',
      'created_at_date',
      'assigned_at',
      'date_of_work',
      'is_assigned',
      'is_worked',
    ];

    await writeHeaders(sheets, sheetName, headers);

    logger.blank();
    logger.header('Setup Complete');
    logger.success('Test sheet is ready for testing!');
    logger.info(`Sheet URL: https://docs.google.com/spreadsheets/d/${TEST_SHEET_CONFIG.SHEET_ID}`);
    logger.blank();
    logger.info('Now run: npm run test:algolia');
  } catch (error: any) {
    logger.blank();
    logger.error('Setup failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run setup
main();
