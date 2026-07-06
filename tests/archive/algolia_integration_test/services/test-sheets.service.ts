/**
 * Test Google Sheets Service
 *
 * Writes OrderSnapshot data to test Google Sheet
 * Modified version of production sheets.ts for test sheet
 */

import { google } from 'googleapis';
import type { OrderSnapshot } from '../../../src/types/orders';
import { TEST_SHEET_CONFIG } from '../config/test-sheet.config';
import { createLogger } from '../utils/logger';

const logger = createLogger('Sheets');

/**
 * Get environment variable helper
 */
const getEnv = (key: string) => {
  return process.env[key];
};

/**
 * Get test sheets ID
 */
const getTestSheetsId = () => TEST_SHEET_CONFIG.SHEET_ID;

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
 * Append order snapshots to raw hourly sheet
 */
export async function appendOrderSnapshots(snapshots: OrderSnapshot[]): Promise<void> {
  if (snapshots.length === 0) {
    logger.warn('No snapshots to write');
    return;
  }

  logger.info(`Writing ${snapshots.length} snapshots to test sheet...`);

  const sheets = getSheetsClient();

  const rows = snapshots.map((s) => [
    s.snapshot_timestamp,
    s.snapshot_hour_ist,
    s.order_id,
    s.facility_id,
    s.provider_name || '',
    s.master_auth_status,
    s.created_at,
    s.created_at_date,
    s.assigned_at || '',
    s.date_of_work || '',
    s.is_assigned,
    s.is_worked,
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getTestSheetsId(),
      range: `${TEST_SHEET_CONFIG.SHEET_NAMES.RAW_HOURLY}!A:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows,
      },
    });

    logger.success(`Successfully written to ${TEST_SHEET_CONFIG.SHEET_NAMES.RAW_HOURLY}`);
  } catch (error: any) {
    logger.error('Failed to write to Google Sheets:', error.message);
    throw error;
  }
}

/**
 * Clear all data from a sheet (keeping headers)
 */
export async function clearSheet(sheetName: string): Promise<void> {
  logger.info(`Clearing sheet: ${sheetName}...`);

  const sheets = getSheetsClient();

  try {
    // Get current data range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getTestSheetsId(),
      range: `${sheetName}!A:ZZ`,
    });

    const rowCount = response.data.values?.length || 0;

    if (rowCount <= 1) {
      logger.info(`${sheetName} already clean (only headers)`);
      return;
    }

    // Clear all data except header row
    await sheets.spreadsheets.values.clear({
      spreadsheetId: getTestSheetsId(),
      range: `${sheetName}!A2:ZZ${rowCount}`,
    });

    logger.success(`Cleared ${rowCount - 1} rows from ${sheetName}`);
  } catch (error: any) {
    logger.error(`Failed to clear sheet ${sheetName}:`, error.message);
    throw error;
  }
}

/**
 * Get the test sheet URL
 */
export function getTestSheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${getTestSheetsId()}`;
}
