/**
 * Google Sheets Capacity Monitoring Service
 *
 * Monitors cell count for both RAW DATA LAKE and DASHBOARD spreadsheets
 * to prevent hitting the 10M cell limit. Sends Slack alerts when:
 * - RAW DATA LAKE exceeds 80% capacity (8M cells) - time to archive old data
 * - DASHBOARD exceeds 100k cells (should never happen with retention policy)
 */

import { google } from 'googleapis';
import {
  RAW_DATA_SHEETS_ID,
  DASHBOARD_SHEETS_ID,
  isDualSpreadsheetMode,
} from '../config/data-source.config';
import { SlackConfig } from '../alerts/config/slack.config';

// Support both browser (import.meta.env) and Node.js (process.env)
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
 * Google Sheets cell limit (hard limit enforced by Google)
 */
export const GOOGLE_SHEETS_CELL_LIMIT = 10_000_000;

/**
 * Capacity thresholds for alerts
 */
export const CAPACITY_THRESHOLDS = {
  RAW_DATA: {
    WARNING: 0.8, // 80% - send alert, plan archival
    CRITICAL: 0.9, // 90% - urgent archival needed
  },
  DASHBOARD: {
    WARNING: 500_000, // 500k cells - alert if retention policy fails (most cells are empty grid space)
    CRITICAL: 1_000_000, // 1M cells - critical issue
  },
};

/**
 * Spreadsheet capacity information
 */
export interface SpreadsheetCapacity {
  spreadsheetId: string;
  spreadsheetName: string;
  totalCells: number;
  usedCells: number;
  percentUsed: number;
  sheets: SheetCapacity[];
}

/**
 * Individual sheet capacity information
 */
export interface SheetCapacity {
  sheetName: string;
  rows: number;
  columns: number;
  cells: number;
}

/**
 * Calculate cell count for a spreadsheet
 */
async function getSpreadsheetCapacity(
  spreadsheetId: string,
  spreadsheetName: string
): Promise<SpreadsheetCapacity> {
  const sheets = getSheetsClient();

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });

  const sheetCapacities: SheetCapacity[] = [];
  let usedCells = 0;

  metadata.data.sheets?.forEach((sheet) => {
    const sheetName = sheet.properties?.title || 'Unknown';
    const rows = sheet.properties?.gridProperties?.rowCount || 0;
    const cols = sheet.properties?.gridProperties?.columnCount || 0;
    const cells = rows * cols;

    sheetCapacities.push({
      sheetName,
      rows,
      columns: cols,
      cells,
    });

    usedCells += cells;
  });

  return {
    spreadsheetId,
    spreadsheetName,
    totalCells: GOOGLE_SHEETS_CELL_LIMIT,
    usedCells,
    percentUsed: (usedCells / GOOGLE_SHEETS_CELL_LIMIT) * 100,
    sheets: sheetCapacities,
  };
}

/**
 * Send Slack alert for capacity warning
 */
async function sendCapacityAlert(
  spreadsheetType: 'RAW_DATA' | 'DASHBOARD',
  capacity: SpreadsheetCapacity,
  severity: 'WARNING' | 'CRITICAL'
): Promise<void> {
  const alertsWebhook = SlackConfig.getAlertsWebhookUrl();

  if (!alertsWebhook) {
    console.warn('⚠️  SLACK_WEBHOOK_ALERTS not configured. Skipping alert.');
    return;
  }

  const emoji = severity === 'CRITICAL' ? '🚨' : '⚠️';
  const color = severity === 'CRITICAL' ? 'danger' : 'warning';

  const message = {
    text: `${emoji} Google Sheets Capacity Alert`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${spreadsheetType} Capacity ${severity}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Spreadsheet:*\n${capacity.spreadsheetName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Used Cells:*\n${capacity.usedCells.toLocaleString()} / ${capacity.totalCells.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Capacity:*\n${capacity.percentUsed.toFixed(2)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${severity}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: getAlertMessage(spreadsheetType, severity, capacity),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Spreadsheet ID: \`${capacity.spreadsheetId}\``,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(alertsWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    console.log(`✅ Sent ${severity} capacity alert to Slack`);
  } catch (error) {
    console.error('❌ Failed to send capacity alert to Slack:', error);
  }
}

/**
 * Get alert message based on spreadsheet type and severity
 */
function getAlertMessage(
  spreadsheetType: 'RAW_DATA' | 'DASHBOARD',
  severity: 'WARNING' | 'CRITICAL',
  capacity: SpreadsheetCapacity
): string {
  if (spreadsheetType === 'RAW_DATA') {
    if (severity === 'CRITICAL') {
      return (
        `*CRITICAL:* RAW DATA LAKE is at ${capacity.percentUsed.toFixed(1)}% capacity!\n\n` +
        `⚠️ *IMMEDIATE ACTION REQUIRED*\n` +
        `• Archive old data from \`orders_raw_hourly\` sheet\n` +
        `• Move data older than 60 days to a separate spreadsheet\n` +
        `• System may stop writing data soon if limit is reached\n\n` +
        `📊 *Largest Sheets:*\n${getLargestSheetsText(capacity.sheets, 3)}`
      );
    } else {
      return (
        `*WARNING:* RAW DATA LAKE is at ${capacity.percentUsed.toFixed(1)}% capacity.\n\n` +
        `📋 *Recommended Action:*\n` +
        `• Plan archival of old data from \`orders_raw_hourly\` sheet\n` +
        `• Consider archiving data older than 30-60 days\n` +
        `• Estimated days until 90%: ${estimateDaysUntilCapacity(capacity, 0.9)}\n\n` +
        `📊 *Largest Sheets:*\n${getLargestSheetsText(capacity.sheets, 3)}`
      );
    }
  } else {
    // DASHBOARD
    return (
      `*${severity}:* DASHBOARD sheet unexpectedly large!\n\n` +
      `⚠️ *This should NOT happen* - retention policy should keep DASHBOARD < 40k cells.\n\n` +
      `🔍 *Check:*\n` +
      `• Verify retention policy is running daily at 3 AM IST\n` +
      `• Check scheduler logs for retention errors\n` +
      `• Manually run: \`npm run cli test-retention-policy\`\n\n` +
      `📊 *Sheet Sizes:*\n${getLargestSheetsText(capacity.sheets, 5)}`
    );
  }
}

/**
 * Get text summary of largest sheets
 */
function getLargestSheetsText(sheets: SheetCapacity[], topN: number): string {
  const sorted = [...sheets].sort((a, b) => b.cells - a.cells);
  const top = sorted.slice(0, topN);

  return top
    .map(
      (s) =>
        `• *${s.sheetName}*: ${s.cells.toLocaleString()} cells (${s.rows.toLocaleString()} rows × ${s.columns} cols)`
    )
    .join('\n');
}

/**
 * Estimate days until reaching target capacity
 * Based on average daily growth rate (simplified estimation)
 */
function estimateDaysUntilCapacity(
  capacity: SpreadsheetCapacity,
  targetPercent: number
): string {
  // Simplified estimation: assume 324k cells/day growth for RAW DATA LAKE
  const DAILY_GROWTH_CELLS = 324_000;
  const remainingCells = targetPercent * GOOGLE_SHEETS_CELL_LIMIT - capacity.usedCells;
  const daysRemaining = Math.floor(remainingCells / DAILY_GROWTH_CELLS);

  if (daysRemaining < 0) return 'Already exceeded!';
  if (daysRemaining === 0) return 'Today!';
  return `~${daysRemaining} days`;
}

/**
 * Check capacity for both spreadsheets and send alerts if needed
 */
export async function checkSheetCapacity(): Promise<{
  rawData?: SpreadsheetCapacity;
  dashboard?: SpreadsheetCapacity;
}> {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  GOOGLE SHEETS CAPACITY CHECK                  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (!isDualSpreadsheetMode()) {
    console.warn('⚠️  Dual-spreadsheet mode not configured. Skipping capacity check.');
    return {};
  }

  const results: {
    rawData?: SpreadsheetCapacity;
    dashboard?: SpreadsheetCapacity;
  } = {};

  try {
    // Check RAW DATA LAKE capacity
    if (RAW_DATA_SHEETS_ID) {
      console.log('📊 Checking RAW DATA LAKE capacity...');
      const rawCapacity = await getSpreadsheetCapacity(
        RAW_DATA_SHEETS_ID,
        'PA Orders - Raw Data Lake'
      );
      results.rawData = rawCapacity;

      console.log(`   Total cells: ${rawCapacity.usedCells.toLocaleString()} / ${rawCapacity.totalCells.toLocaleString()}`);
      console.log(`   Capacity: ${rawCapacity.percentUsed.toFixed(2)}%`);
      console.log(`   Sheets:`);
      rawCapacity.sheets.forEach((sheet) => {
        console.log(
          `     - ${sheet.sheetName}: ${sheet.cells.toLocaleString()} cells`
        );
      });

      // Check thresholds
      if (rawCapacity.percentUsed >= CAPACITY_THRESHOLDS.RAW_DATA.CRITICAL * 100) {
        console.log(`   🚨 CRITICAL: RAW DATA LAKE at ${rawCapacity.percentUsed.toFixed(1)}%`);
        await sendCapacityAlert('RAW_DATA', rawCapacity, 'CRITICAL');
      } else if (
        rawCapacity.percentUsed >=
        CAPACITY_THRESHOLDS.RAW_DATA.WARNING * 100
      ) {
        console.log(`   ⚠️  WARNING: RAW DATA LAKE at ${rawCapacity.percentUsed.toFixed(1)}%`);
        await sendCapacityAlert('RAW_DATA', rawCapacity, 'WARNING');
      } else {
        console.log(`   ✅ RAW DATA LAKE capacity OK`);
      }
    }

    // Check DASHBOARD capacity
    if (DASHBOARD_SHEETS_ID) {
      console.log('\n📊 Checking DASHBOARD capacity...');
      const dashboardCapacity = await getSpreadsheetCapacity(
        DASHBOARD_SHEETS_ID,
        'PA Analytics Dashboard - Live Metrics'
      );
      results.dashboard = dashboardCapacity;

      console.log(
        `   Total cells: ${dashboardCapacity.usedCells.toLocaleString()} / ${dashboardCapacity.totalCells.toLocaleString()}`
      );
      console.log(`   Capacity: ${dashboardCapacity.percentUsed.toFixed(2)}%`);
      console.log(`   Sheets:`);
      dashboardCapacity.sheets.forEach((sheet) => {
        console.log(
          `     - ${sheet.sheetName}: ${sheet.cells.toLocaleString()} cells`
        );
      });

      // Check thresholds
      if (dashboardCapacity.usedCells >= CAPACITY_THRESHOLDS.DASHBOARD.CRITICAL) {
        console.log(
          `   🚨 CRITICAL: DASHBOARD has ${dashboardCapacity.usedCells.toLocaleString()} cells (should be < 40k!)`
        );
        await sendCapacityAlert('DASHBOARD', dashboardCapacity, 'CRITICAL');
      } else if (
        dashboardCapacity.usedCells >= CAPACITY_THRESHOLDS.DASHBOARD.WARNING
      ) {
        console.log(
          `   ⚠️  WARNING: DASHBOARD has ${dashboardCapacity.usedCells.toLocaleString()} cells (should be < 40k!)`
        );
        await sendCapacityAlert('DASHBOARD', dashboardCapacity, 'WARNING');
      } else {
        console.log(`   ✅ DASHBOARD capacity OK`);
      }
    }

    console.log('\n✅ Capacity check completed\n');
    return results;
  } catch (error) {
    console.error('❌ Error checking sheet capacity:', error);
    throw error;
  }
}

/**
 * Get capacity summary for logging/monitoring
 */
export async function getCapacitySummary(): Promise<string> {
  if (!isDualSpreadsheetMode()) {
    return 'Dual-spreadsheet mode not configured';
  }

  try {
    const results = await checkSheetCapacity();

    const lines: string[] = ['Sheet Capacity Summary:'];

    if (results.rawData) {
      lines.push(
        `  RAW DATA LAKE: ${results.rawData.usedCells.toLocaleString()} cells (${results.rawData.percentUsed.toFixed(2)}%)`
      );
    }

    if (results.dashboard) {
      lines.push(
        `  DASHBOARD: ${results.dashboard.usedCells.toLocaleString()} cells (${results.dashboard.percentUsed.toFixed(2)}%)`
      );
    }

    return lines.join('\n');
  } catch (error) {
    return `Error getting capacity summary: ${error}`;
  }
}
