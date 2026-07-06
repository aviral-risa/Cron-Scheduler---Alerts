/**
 * Open Orders DOS Passed Slack Alert
 * Identifies orders still in open statuses (auth_required, pending, hold, query)
 * where the Date of Service has already passed.
 * Reads from unique_orders_status sheet, groups by DOS date, renders PNG via Puppeteer.
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import path from 'path';
import { getExistingOrderStatusMap } from '../services/sheets-dual';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import type { UniqueOrderStatus } from '../types/orders';
import { uploadImageToSlack } from './utils/slack-uploader';

const TEST_CHANNEL = 'C0ADHS3NWLD';
const OPEN_STATUSES = new Set(['auth_required', 'pending', 'hold', 'query']);

interface DosRow {
  dosIso: string;
  displayDate: string;
  authRequired: number;
  pending: number;
  hold: number;
  query: number;
  totalOpen: number;
}

/**
 * Parse a DOS value (MM/DD/YYYY or YYYY-MM-DD) into YYYY-MM-DD for comparison
 */
function parseDosToIso(dos: string): string | null {
  // MM/DD/YYYY format
  const slashMatch = dos.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD (or ISO timestamp — take date part)
  const isoDate = dos.split('T')[0].split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  return null;
}

/**
 * Build past-DOS open order rows for a specific facility from pre-loaded order data
 */
function buildPastDosRows(orders: UniqueOrderStatus[], facilityId: string): DosRow[] {
  const todayIso = new Date().toISOString().split('T')[0];

  const dosGroups = new Map<string, { authRequired: number; pending: number; hold: number; query: number }>();

  for (const order of orders) {
    if (order.org_id !== facilityId) continue;
    if (!OPEN_STATUSES.has(order.master_auth_status)) continue;
    if (order.is_duplicate) continue;

    const dos = order.date_of_service_iso;
    if (!dos) continue;
    const dosDate = parseDosToIso(dos);
    if (!dosDate || dosDate >= todayIso) continue;

    let group = dosGroups.get(dosDate);
    if (!group) {
      group = { authRequired: 0, pending: 0, hold: 0, query: 0 };
      dosGroups.set(dosDate, group);
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

  const rows: DosRow[] = [];
  for (const [dosDate, counts] of Array.from(dosGroups.entries())) {
    const totalOpen = counts.authRequired + counts.pending + counts.hold + counts.query;
    if (totalOpen === 0) continue;

    const dateObj = new Date(dosDate + 'T00:00:00');
    const displayDate = dateObj.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

    rows.push({ dosIso: dosDate, displayDate, ...counts, totalOpen });
  }

  rows.sort((a, b) => b.dosIso.localeCompare(a.dosIso));
  return rows;
}

/**
 * Generate HTML table for Puppeteer rendering
 */
function generateHTML(orgName: string, data: DosRow[]): string {
  const totals = data.reduce(
    (acc, row) => ({
      authRequired: acc.authRequired + row.authRequired,
      pending: acc.pending + row.pending,
      hold: acc.hold + row.hold,
      query: acc.query + row.query,
      totalOpen: acc.totalOpen + row.totalOpen,
    }),
    { authRequired: 0, pending: 0, hold: 0, query: 0, totalOpen: 0 }
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
        <div class="header">${orgName} - Open Orders with Past DOS</div>
        <table>
          <thead>
            <tr>
              <th class="left">Date of Service</th>
              <th>Auth Required</th>
              <th>Pending</th>
              <th>Hold</th>
              <th>Query</th>
              <th>Total Open</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
            <tr>
              <td class="left">${row.displayDate}</td>
              <td>${fmt(row.authRequired)}</td>
              <td>${fmt(row.pending)}</td>
              <td>${fmt(row.hold)}</td>
              <td>${fmt(row.query)}</td>
              <td class="font-bold">${fmt(row.totalOpen)}</td>
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
              <td class="font-bold">${fmt(totals.totalOpen)}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">${data.length} unique DOS dates with open orders</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send Open Orders DOS Passed alert for a single organization
 */
async function sendAlertForOrg(org: Organization, allOrders: UniqueOrderStatus[]): Promise<void> {
  console.log(`\n📤 Sending Open Orders DOS Passed alert for ${org.name}...`);

  const data = buildPastDosRows(allOrders, org.facilityId);

  if (data.length === 0) {
    console.log(`⚠️  No open orders with past DOS found for ${org.name}. Skipping.`);
    return;
  }

  const totalOpen = data.reduce((sum, row) => sum + row.totalOpen, 0);
  console.log(`Found ${totalOpen} open orders across ${data.length} past DOS dates`);

  const imagePath = path.join(process.cwd(), `open-orders-dos-passed-${org.id}.png`);
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

  const channel = org.slackChannelId || TEST_CHANNEL;
  await uploadImageToSlack({
    imagePath,
    channel,
    title: `${org.name} - Open Orders with Past DOS`,
    filename: `open-orders-dos-passed-${org.id}.png`,
    comment: `*${org.name} - Open Orders with Past DOS*`,
    useOrgChannel: false,
    cleanup: true,
  });

  console.log(`✓ Successfully sent alert for ${org.name} (${totalOpen} orders, ${data.length} DOS dates)`);
}

/**
 * Send Open Orders DOS Passed alerts for all organizations
 */
export async function sendOpenOrdersDosPassedAlerts(): Promise<void> {
  console.log('🚀 Starting Open Orders DOS Passed alerts for all organizations...');

  // Read sheet data once, reuse for all orgs
  const orderMap = await getExistingOrderStatusMap();
  const allOrders = Array.from(orderMap.values());

  const results = await Promise.allSettled(
    ORGANIZATIONS.map((org) => sendAlertForOrg(org, allOrders))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Open Orders DOS Passed Alerts Summary:');
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

// Execute when run directly
sendOpenOrdersDosPassedAlerts()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
