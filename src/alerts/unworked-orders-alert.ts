/**
 * Unworked Orders Slack Alert
 * Sends per-organization alerts showing providers with orders still in "New" status
 * Renders as PNG image via Puppeteer and uploads to Slack
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import path from 'path';
import { algoliaFetchService, type AlgoliaOrder } from '../services/algolia/fetch.service';
import { getMedOncOrganizations, ORGANIZATIONS, type Organization } from '../config/organizations';
import { toISTDate } from '../utils/timezone';
import { uploadImageToSlack } from './utils/slack-uploader';

const TEST_CHANNEL = 'C0ADHS3NWLD';

interface ProviderUnworkedCount {
  providerName: string;
  unworkedCount: number;
}

/**
 * Fetch orders directly from Algolia for a specific organization on a given date.
 * Returns all orders and the unworked subset (assigned orders with master_auth_status = 'New').
 */
async function fetchOrdersFromAlgolia(
  facilityId: string,
  date: Date
): Promise<{ allOrders: AlgoliaOrder[]; providerCounts: ProviderUnworkedCount[] }> {
  const dateStr = toISTDate(date);

  const allOrders = await algoliaFetchService.fetchOrdersByDate(facilityId, dateStr);

  if (allOrders.length === 0) {
    console.warn(`No orders found for ${facilityId} on ${dateStr}.`);
    return { allOrders: [], providerCounts: [] };
  }

  // Unworked = assigned orders still in 'New' master_auth_status
  const newOrders = allOrders.filter(
    (o) =>
      o.assigned_to_name &&
      o.assigned_to_name.toLowerCase() !== 'unassigned' &&
      o.master_auth_status?.toLowerCase() === 'new'
  );

  // Group by assignee
  const byProvider = new Map<string, number>();
  for (const order of newOrders) {
    const name = order.assigned_to_name;
    byProvider.set(name, (byProvider.get(name) || 0) + 1);
  }

  const providerCounts = Array.from(byProvider.entries())
    .map(([providerName, unworkedCount]) => ({ providerName, unworkedCount }))
    .sort((a, b) => b.unworkedCount - a.unworkedCount);

  return { allOrders, providerCounts };
}

/**
 * Generate HTML table for Puppeteer rendering
 */
function generateHTML(
  org: Organization,
  data: ProviderUnworkedCount[],
  date: Date,
  totalOrders: number
): string {
  const dateStr = toISTDate(date);
  const dateObj = new Date(dateStr + 'T00:00:00');
  const displayDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const totalUnworked = data.reduce((sum, p) => sum + p.unworkedCount, 0);
  const fmt = (n: number) => n.toLocaleString();

  const tableRows =
    data.length === 0
      ? `<tr><td colspan="3" style="text-align:center; padding:20px; color:#059669;">✅ No orders with status "New" — all assigned orders have been worked on!</td></tr>`
      : data
          .map(
            (p, i) => `
            <tr>
              <td class="left">${i + 1}</td>
              <td class="left">${p.providerName}</td>
              <td class="font-bold">${fmt(p.unworkedCount)}</td>
            </tr>`
          )
          .join('');

  const totalRow =
    data.length > 0
      ? `<tr class="total-row">
          <td class="font-bold left" colspan="2">TOTAL</td>
          <td class="font-bold">${fmt(totalUnworked)}</td>
        </tr>`
      : '';

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
          max-width: 600px;
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
        .sub-header {
          background: #f1f5f9;
          padding: 10px 24px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #475569;
          border-bottom: 1px solid #e2e8f0;
        }
        .sub-header .label { color: #94a3b8; font-size: 11px; }
        .sub-header .value { font-weight: 600; color: #1e293b; }
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
        <div class="header">${org.name} - Unworked Orders Report</div>
        <div class="sub-header">
          <div><span class="label">Date</span><br/><span class="value">${displayDate}</span></div>
          <div><span class="label">Total Orders</span><br/><span class="value">${fmt(totalOrders)}</span></div>
          <div><span class="label">Unworked (New)</span><br/><span class="value">${fmt(totalUnworked)}</span></div>
          <div><span class="label">Providers</span><br/><span class="value">${data.length}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="left">#</th>
              <th class="left">Provider</th>
              <th>Unworked Orders</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            ${totalRow}
          </tbody>
        </table>
        <div class="footer">Orders with master_auth_status = "New" | Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send unworked orders alert for a specific organization as PNG image
 */
export async function sendUnworkedOrdersAlertForOrg(
  org: Organization,
  date: Date = new Date(),
  channelOverride?: string
): Promise<void> {
  try {
    console.log(`\n📤 Sending unworked orders alert for ${org.name}...`);

    const { allOrders, providerCounts } = await fetchOrdersFromAlgolia(org.facilityId, date);
    const totalUnworked = providerCounts.reduce((sum, p) => sum + p.unworkedCount, 0);

    // Generate HTML and convert to PNG via Puppeteer
    const imagePath = path.join(process.cwd(), `unworked-orders-${org.id}.png`);
    const html = generateHTML(org, providerCounts, date, allOrders.length);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html);
      await page.setViewport({ width: 600, height: 800 });
      await page.evaluate(() => document.fonts.ready);

      const contentHeight = await page.evaluate(() => {
        const container = document.querySelector('.container');
        return container ? container.scrollHeight + 40 : 800;
      });
      await page.setViewport({ width: 600, height: contentHeight });

      await page.screenshot({ path: imagePath, type: 'png', fullPage: false });
      console.log(`Image generated: ${imagePath}`);
    } finally {
      await browser.close();
    }

    // Upload to Slack
    const channel = channelOverride || org.slackChannelId || TEST_CHANNEL;
    await uploadImageToSlack({
      imagePath,
      channel,
      title: `${org.name} - Unworked Orders Report`,
      filename: `unworked-orders-${org.id}.png`,
      comment: `*${org.name} - Unworked Orders Report* | ${totalUnworked} orders still in "New" status`,
      useOrgChannel: false,
      cleanup: true,
    });

    console.log(`✓ Successfully sent unworked orders alert for ${org.name}`);
    console.log(`  Total orders: ${allOrders.length}`);
    console.log(`  Unworked (New): ${totalUnworked}`);
    console.log(`  Providers: ${providerCounts.length}`);
  } catch (error) {
    console.error(`❌ Error sending unworked orders alert for ${org.name}:`, error);
    throw error;
  }
}

/**
 * Send unworked orders alerts for all organizations
 */
export async function sendUnworkedOrdersAlerts(
  date: Date = new Date(),
  channelOverride?: string
): Promise<void> {
  console.log('🚀 Starting unworked orders alerts...');
  console.log(`   Date: ${toISTDate(date)}`);
  const orgs = getMedOncOrganizations();

  const results = await Promise.allSettled(
    orgs.map((org) => sendUnworkedOrdersAlertForOrg(org, date, channelOverride))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Unworked Orders Alerts Summary:');
  console.log(`   ✓ Successful: ${successful}/${orgs.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${orgs.length}`);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`   Failed for ${orgs[index].name}:`, result.reason);
      }
    });
  }
}

// CLI execution
async function main() {
  const orgArg = process.argv[2];
  const dateArg = process.argv[3]; // optional YYYY-MM-DD
  const channelArg = process.argv[4]; // optional channel override

  const date = dateArg ? new Date(dateArg + 'T00:00:00+05:30') : new Date();

  try {
    if (orgArg) {
      const org = ORGANIZATIONS.find((o) => o.id === orgArg.toLowerCase());
      if (!org) {
        console.error(
          `Error: Unknown organization '${orgArg}'. Valid: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`
        );
        process.exit(1);
      }
      await sendUnworkedOrdersAlertForOrg(org, date, channelArg);
    } else {
      await sendUnworkedOrdersAlerts(date, channelArg);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly: npx tsx src/alerts/unworked-orders-alert.ts [org] [YYYY-MM-DD] [channel]
const isDirectExecution = process.argv[1]?.includes('unworked-orders-alert');
if (isDirectExecution) {
  main();
}
