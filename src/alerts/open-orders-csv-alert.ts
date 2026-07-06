/**
 * Open Orders CSV Slack Alert
 * Sends a CSV file per organization with open order details from unique_orders_status sheet.
 * Open orders = master_auth_status in (auth_required, pending, hold, query)
 * Columns: Date, Order ID, Assigned To, Auth Status, Date of Service
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { WebClient } from '@slack/web-api';
import { getSheetsClient, getSpreadsheetId } from '../services/sheets-dual';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import { SlackConfig } from './config/slack.config';

const TEST_CHANNEL = 'C0ADHS3NWLD';
const OPEN_STATUSES = ['auth_required', 'pending', 'hold', 'query'];

interface OpenOrderRow {
  date: string;
  orderId: string;
  assignedTo: string;
  authStatus: string;
  dateOfService: string;
}

/**
 * Fetch all open orders from unique_orders_status sheet for a given org
 */
async function getOpenOrdersForOrg(facilityId: string): Promise<OpenOrderRow[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'unique_orders_status!A:AQ',
  });

  const rows = response.data.values || [];
  const results: OpenOrderRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const orgId = row[7] || '';
    const masterAuthStatus = (row[13] || '').toLowerCase();

    if (orgId !== facilityId) continue;
    if (!OPEN_STATUSES.includes(masterAuthStatus)) continue;

    const createdAtIso = row[1] || '';
    const date = createdAtIso.split('T')[0].split(' ')[0];

    const dosIso = row[6] || '';
    const dateOfService = dosIso ? dosIso.split('T')[0].split(' ')[0] : '';

    results.push({
      date,
      orderId: row[0] || '',
      assignedTo: row[3] || 'Unassigned',
      authStatus: row[13] || '',
      dateOfService,
    });
  }

  // Sort by date desc, then assignee
  results.sort((a, b) => b.date.localeCompare(a.date) || a.assignedTo.localeCompare(b.assignedTo));

  return results;
}

/**
 * Generate CSV content from open order rows
 */
function generateCSV(rows: OpenOrderRow[]): string {
  const lines = ['Date,Order ID,Assigned To,Auth Status,Date of Service'];
  for (const r of rows) {
    const assignedTo = r.assignedTo.includes(',') ? `"${r.assignedTo}"` : r.assignedTo;
    lines.push(`${r.date},${r.orderId},${assignedTo},${r.authStatus},${r.dateOfService}`);
  }
  return lines.join('\n');
}

/**
 * Send open orders CSV for a specific organization
 */
export async function sendOpenOrdersCSVForOrg(
  org: Organization,
  channelOverride?: string
): Promise<void> {
  console.log(`\n📤 Generating open orders CSV for ${org.name}...`);

  const openOrders = await getOpenOrdersForOrg(org.facilityId);
  console.log(`  Found ${openOrders.length} open orders`);

  if (openOrders.length === 0) {
    console.log(`  No open orders for ${org.name}, skipping.`);
    return;
  }

  // Generate CSV file
  const csv = generateCSV(openOrders);
  const csvPath = path.join(process.cwd(), `open-orders-${org.id}.csv`);
  fs.writeFileSync(csvPath, csv);

  // Upload to Slack
  const botToken = SlackConfig.getBotToken();
  const web = new WebClient(botToken);
  const channel = channelOverride || org.slackChannelId || TEST_CHANNEL;

  try {
    await web.filesUploadV2({
      channel_id: channel,
      file: fs.createReadStream(csvPath),
      filename: `open-orders-${org.id}.csv`,
      title: `${org.name} - Open Orders Detail`,
      initial_comment: `*${org.name} - Open Orders Detail*\n${openOrders.length} open orders (Auth Required, Pending, Hold, Query)`,
    });
    console.log(`  ✓ Uploaded to channel ${channel}`);
  } finally {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
  }
}

/**
 * Send open orders CSV for all organizations
 */
export async function sendOpenOrdersCSVAlerts(channelOverride?: string): Promise<void> {
  console.log('🚀 Starting open orders CSV alerts...');

  // Fetch sheet data once, then filter per org
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  console.log('Reading unique_orders_status sheet...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'unique_orders_status!A:AQ',
  });

  const allRows = response.data.values || [];
  console.log(`Total rows: ${allRows.length - 1}`);

  const botToken = SlackConfig.getBotToken();
  const web = new WebClient(botToken);

  for (const org of ORGANIZATIONS) {
    const openOrders: OpenOrderRow[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      const orgId = row[7] || '';
      const masterAuthStatus = (row[13] || '').toLowerCase();

      if (orgId !== org.facilityId) continue;
      if (!OPEN_STATUSES.includes(masterAuthStatus)) continue;

      const createdAtIso = row[1] || '';
      const date = createdAtIso.split('T')[0].split(' ')[0];

      openOrders.push({
        date,
        orderId: row[0] || '',
        assignedTo: row[3] || 'Unassigned',
        authStatus: row[13] || '',
      });
    }

    openOrders.sort((a, b) => b.date.localeCompare(a.date) || a.assignedTo.localeCompare(b.assignedTo));

    console.log(`\n${org.name}: ${openOrders.length} open orders`);

    if (openOrders.length === 0) {
      console.log('  No open orders, skipping.');
      continue;
    }

    const csv = generateCSV(openOrders);
    const csvPath = path.join(process.cwd(), `open-orders-${org.id}.csv`);
    fs.writeFileSync(csvPath, csv);

    const channel = channelOverride || org.slackChannelId || TEST_CHANNEL;
    console.log(`  Uploading to channel ${channel}...`);

    try {
      await web.filesUploadV2({
        channel_id: channel,
        file: fs.createReadStream(csvPath),
        filename: `open-orders-${org.id}.csv`,
        title: `${org.name} - Open Orders Detail`,
        initial_comment: `*${org.name} - Open Orders Detail*\n${openOrders.length} open orders (Auth Required, Pending, Hold, Query)`,
      });
      console.log('  ✓ Uploaded');
    } catch (err: any) {
      console.error(`  ❌ Failed: ${err.message}`);
    } finally {
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    }
  }

  console.log('\n✅ Done!');
}

// CLI: npx tsx src/alerts/open-orders-csv-alert.ts [org] [channel]
async function main() {
  const orgArg = process.argv[2];
  const channelArg = process.argv[3];

  if (orgArg) {
    const org = ORGANIZATIONS.find((o) => o.id === orgArg.toLowerCase());
    if (!org) {
      console.error(`Unknown org '${orgArg}'. Valid: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`);
      process.exit(1);
    }
    await sendOpenOrdersCSVForOrg(org, channelArg);
  } else {
    await sendOpenOrdersCSVAlerts(channelArg);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
