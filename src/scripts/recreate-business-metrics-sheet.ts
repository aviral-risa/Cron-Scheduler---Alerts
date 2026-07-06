/**
 * Recreate business_metrics_daily Sheet
 *
 * Deletes the existing sheet and creates a new one with updated schema (23 columns)
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { initBusinessMetricsSheet } from './init-business-metrics-sheet';

export async function recreateBusinessMetricsSheet() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Recreate business_metrics_daily Sheet        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    return;
  }

  try {
    // Get sheet metadata
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = spreadsheetMeta.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAMES.BUSINESS_METRICS_DAILY
    );

    if (sheet && sheet.properties?.sheetId !== undefined) {
      console.log(`Deleting existing ${SHEET_NAMES.BUSINESS_METRICS_DAILY} sheet...`);

      // Delete the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId: sheet.properties.sheetId,
              },
            },
          ],
        },
      });

      console.log('✅ Sheet deleted\n');
    } else {
      console.log('⚠️  Sheet does not exist, will create new\n');
    }

    // Create new sheet with updated schema
    await initBusinessMetricsSheet();

  } catch (error) {
    console.error('❌ Error recreating sheet:', error);
  }
}
