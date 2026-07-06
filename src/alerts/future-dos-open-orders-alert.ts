/**
 * Future DOS Open Orders Slack Alert
 * Identifies open orders (auth_required, pending, hold, query) where the
 * Date of Service is in the future (next 7 days), grouped by assignee.
 * Sends PNG summary + CSV detail per org to their respective Slack channels.
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { WebClient } from '@slack/web-api';
import { getExistingOrderStatusMap } from '../services/sheets-dual';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import type { UniqueOrderStatus } from '../types/orders';
import { uploadImageToSlack } from './utils/slack-uploader';
import { SlackConfig } from './config/slack.config';

const TEST_CHANNEL = 'C0ADHS3NWLD';
const OPEN_STATUSES = new Set(['auth_required', 'pending', 'hold', 'query']);

interface AssigneeRow {
  assignee: string;
  authRequired: number;
  pending: number;
  hold: number;
  query: number;
  total: number;
}

/**
 * Parse a DOS value (MM/DD/YYYY or YYYY-MM-DD) into YYYY-MM-DD for comparison
 */
function parseDosToIso(dos: string): string | null {
  const slashMatch = dos.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const isoDate = dos.split('T')[0].split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  return null;
}

/**
 * Filter orders to open future-DOS for a specific facility (single pass, reused for PNG + CSV)
 */
function filterFutureDosOrders(orders: UniqueOrderStatus[], facilityId: string, daysAhead: number = 7): UniqueOrderStatus[] {
  const todayIso = new Date().toISOString().split('T')[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffIso = cutoff.toISOString().split('T')[0];
  return orders.filter((order) => {
    if (order.org_id !== facilityId) return false;
    if (!OPEN_STATUSES.has(order.master_auth_status)) return false;
    if (order.is_duplicate) return false;
    const dos = order.date_of_service_iso;
    if (!dos) return false;
    const dosDate = parseDosToIso(dos);
    return dosDate != null && dosDate > todayIso && dosDate <= cutoffIso;
  });
}

/**
 * Build assignee summary rows from pre-filtered orders
 */
function buildAssigneeRows(filtered: UniqueOrderStatus[]): AssigneeRow[] {
  const assigneeGroups = new Map<string, { authRequired: number; pending: number; hold: number; query: number }>();

  for (const order of filtered) {
    const assignee = order.assigned_to_name?.trim() || 'Unassigned';

    let group = assigneeGroups.get(assignee);
    if (!group) {
      group = { authRequired: 0, pending: 0, hold: 0, query: 0 };
      assigneeGroups.set(assignee, group);
    }

    switch (order.master_auth_status) {
      case 'auth_required':
        group.authRequired++;
        break;
      case 'pending':
        group.pending++;
        break;
      case 'hold':
        group.hold++;
        break;
      case 'query':
        group.query++;
        break;
    }
  }

  const rows: AssigneeRow[] = [];
  for (const [assignee, counts] of Array.from(assigneeGroups.entries())) {
    const total = counts.authRequired + counts.pending + counts.hold + counts.query;
    if (total === 0) continue;
    rows.push({ assignee, ...counts, total });
  }

  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Generate CSV content from filtered orders
 */
function generateCSV(filtered: UniqueOrderStatus[]): string {
  const lines = ['Order ID,Auth Status,Date of Service,Assignee,Date of Work'];
  const sorted = [...filtered].sort((a, b) => {
    const aName = a.assigned_to_name || '';
    const bName = b.assigned_to_name || '';
    return aName.localeCompare(bName) || (a.date_of_service_iso || '').localeCompare(b.date_of_service_iso || '');
  });
  for (const o of sorted) {
    const assignee = (o.assigned_to_name || 'Unassigned').includes(',')
      ? `"${o.assigned_to_name}"`
      : o.assigned_to_name || 'Unassigned';
    const dos = o.date_of_service_iso ? parseDosToIso(o.date_of_service_iso) || o.date_of_service_iso : '';
    const dow = o.date_of_work_iso ? o.date_of_work_iso.split('T')[0].split(' ')[0] : '';
    lines.push(`${o.order_id},${o.master_auth_status},${dos},${assignee},${dow}`);
  }
  return lines.join('\n');
}

/**
 * Generate HTML table for Puppeteer rendering
 */
function generateHTML(orgName: string, data: AssigneeRow[]): string {
  const totals = data.reduce(
    (acc, row) => ({
      authRequired: acc.authRequired + row.authRequired,
      pending: acc.pending + row.pending,
      hold: acc.hold + row.hold,
      query: acc.query + row.query,
      total: acc.total + row.total,
    }),
    { authRequired: 0, pending: 0, hold: 0, query: 0, total: 0 }
  );

  const fmt = (n: number) => n.toLocaleString();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          background: #f9fafb;
        }
        .container {
          max-width: 1000px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: #1e293b;
          color: white;
          padding: 14px 24px;
          font-size: 16px;
          font-weight: 600;
        }
        table { width: 100%; border-collapse: collapse; background: white; }
        th {
          background: #f9fafb;
          color: #6b7280;
          font-weight: 600;
          font-size: 12px;
          text-align: center;
          padding: 10px 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        th.left { text-align: left; }
        td {
          padding: 8px 16px;
          font-size: 13px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
          text-align: center;
        }
        td.left { text-align: left; }
        tbody tr:last-child td { border-bottom: none; }
        .total-row { background-color: #fef3c7; }
        .total-row td { font-weight: 600; border-bottom: none; }
        .font-bold { font-weight: 600; }
        .footer {
          padding: 10px 24px;
          font-size: 11px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">${orgName} - Open Orders with Future DOS (Next 7 Days)</div>
        <table>
          <thead>
            <tr>
              <th class="left">Assignee</th>
              <th>Auth Required</th>
              <th>Pending</th>
              <th>Hold</th>
              <th>Query</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
            <tr>
              <td class="left">${row.assignee}</td>
              <td>${fmt(row.authRequired)}</td>
              <td>${fmt(row.pending)}</td>
              <td>${fmt(row.hold)}</td>
              <td>${fmt(row.query)}</td>
              <td class="font-bold">${fmt(row.total)}</td>
            </tr>
            `
              )
              .join('')}
            <tr class="total-row">
              <td class="font-bold left">TOTAL</td>
              <td class="font-bold">${fmt(totals.authRequired)}</td>
              <td class="font-bold">${fmt(totals.pending)}</td>
              <td class="font-bold">${fmt(totals.hold)}</td>
              <td class="font-bold">${fmt(totals.query)}</td>
              <td class="font-bold">${fmt(totals.total)}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">${data.length} assignees with open future-DOS orders</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send Future DOS Open Orders alert for a single organization
 */
async function sendAlertForOrg(org: Organization, allOrders: UniqueOrderStatus[]): Promise<void> {
  console.log(`\n📤 Sending Future DOS Open Orders alert for ${org.name}...`);

  const filtered = filterFutureDosOrders(allOrders, org.facilityId);

  if (filtered.length === 0) {
    console.log(`⚠️  No open orders with future DOS found for ${org.name}. Skipping.`);
    return;
  }

  const data = buildAssigneeRows(filtered);
  const totalOpen = filtered.length;
  console.log(`Found ${totalOpen} open orders across ${data.length} assignees`);

  // Generate PNG
  const imagePath = path.join(process.cwd(), `future-dos-open-orders-${org.id}.png`);
  const html = generateHTML(org.name, data);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 1000, height: 800 });
    await page.evaluate(() => document.fonts.ready);

    const contentHeight = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollHeight + 40 : 800;
    });
    await page.setViewport({ width: 1000, height: contentHeight });

    await page.screenshot({ path: imagePath, type: 'png', fullPage: false });
    console.log(`Image generated: ${imagePath}`);
  } finally {
    await browser.close();
  }

  // Generate CSV
  const csvPath = path.join(process.cwd(), `future-dos-open-orders-${org.id}.csv`);
  fs.writeFileSync(csvPath, generateCSV(filtered));
  console.log(`CSV generated: ${csvPath} (${filtered.length} rows)`);

  // Upload PNG + CSV in parallel
  const channel = org.slackChannelId || TEST_CHANNEL;

  const pngUpload = uploadImageToSlack({
    imagePath,
    channel,
    title: `${org.name} - Open Orders with Future DOS (Next 7 Days)`,
    filename: `future-dos-open-orders-${org.id}.png`,
    comment: `*${org.name} - Open Orders with Future DOS (Next 7 Days)*`,
    useOrgChannel: false,
    cleanup: true,
  });

  const csvUpload = (async () => {
    const web = new WebClient(SlackConfig.getBotToken());
    try {
      await web.filesUploadV2({
        channel_id: channel,
        file: fs.createReadStream(csvPath),
        filename: `future-dos-open-orders-${org.id}.csv`,
        title: `${org.name} - Future DOS Open Orders Detail`,
        initial_comment: `*${org.name} - Future DOS Open Orders Detail*\n${filtered.length} open orders with future DOS (next 7 days)`,
      });
      console.log(`✓ CSV uploaded to Slack for ${org.name}`);
    } finally {
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    }
  })();

  await Promise.all([pngUpload, csvUpload]);

  console.log(`✓ Successfully sent Future DOS alert for ${org.name} (${totalOpen} orders, ${data.length} assignees)`);
}

/**
 * Send Future DOS Open Orders alerts for all organizations
 */
export async function sendFutureDosOpenOrdersAlert(): Promise<void> {
  console.log('🚀 Starting Future DOS Open Orders alerts for all organizations...');

  const orderMap = await getExistingOrderStatusMap();
  const allOrders = Array.from(orderMap.values());

  const results = await Promise.allSettled(
    ORGANIZATIONS.map((org) => sendAlertForOrg(org, allOrders))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Future DOS Open Orders Alerts Summary:');
  console.log(`   ✓ Successful: ${successful}/${ORGANIZATIONS.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${ORGANIZATIONS.length}`);
  }

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`   Failed for ${ORGANIZATIONS[index].name}:`, result.reason);
    }
  });
}

// Execute when run directly (not via CLI import)
if (process.argv[1]?.includes('future-dos-open-orders-alert')) {
  sendFutureDosOpenOrdersAlert()
    .then(() => {
      console.log('✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}
