/**
 * Open Orders Summary Slack Alert
 * Sends per-organization alerts showing open orders breakdown from Jan 1 to today
 * Renders as PNG image via Puppeteer and uploads to Slack
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import path from 'path';
import { getBusinessMetricsForRange } from '../services/sheets-dual';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import { toISTDate } from '../utils/timezone';
import { uploadImageToSlack } from './utils/slack-uploader';

const TEST_CHANNEL = 'C0ADHS3NWLD'; // Fallback for orgs without a channel

interface OpenOrdersRow {
  date: string;
  displayDate: string;
  authRequired: number;
  pending: number;
  hold: number;
  query: number;
  totalOpenOrders: number;
}

/**
 * Fetch open orders data for a specific organization from Jan 1 to today
 */
async function fetchOpenOrdersDataForOrg(facilityId: string): Promise<OpenOrdersRow[]> {
  try {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), 0, 1); // January 1st of current year

    const startDateStr = toISTDate(startDate);
    const endDateStr = toISTDate(today);

    const summaries = await getBusinessMetricsForRange([facilityId], startDateStr, endDateStr);

    // Filter weekends (match dashboard logic)
    const weekdaySummaries = summaries.filter(s => {
      const dateObj = new Date(s.created_at_date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    });

    // Sort by date ascending
    const sortedSummaries = weekdaySummaries.sort((a, b) => a.created_at_date.localeCompare(b.created_at_date));

    const result: OpenOrdersRow[] = sortedSummaries.map(summary => {
      const authRequired = summary.status_auth_required || 0;
      const pending = summary.status_pending || 0;
      const hold = summary.status_hold || 0;
      const query = summary.status_query || 0;
      const totalOpenOrders = authRequired + pending + hold + query;

      const dateObj = new Date(summary.created_at_date + 'T00:00:00');
      const displayDate = dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });

      return {
        date: summary.created_at_date,
        displayDate,
        authRequired,
        pending,
        hold,
        query,
        totalOpenOrders,
      };
    });

    // Filter out rows where total open orders is 0
    const filtered = result.filter(row => row.totalOpenOrders > 0);

    // Sort by date descending (latest first)
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    return filtered;
  } catch (error) {
    console.error(`Error fetching open orders data for facility ${facilityId}:`, error);
    throw error;
  }
}

/**
 * Generate HTML table for Puppeteer rendering
 */
function generateHTML(org: Organization, data: OpenOrdersRow[]): string {
  const totals = data.reduce(
    (acc, row) => ({
      authRequired: acc.authRequired + row.authRequired,
      pending: acc.pending + row.pending,
      hold: acc.hold + row.hold,
      query: acc.query + row.query,
      totalOpenOrders: acc.totalOpenOrders + row.totalOpenOrders,
    }),
    { authRequired: 0, pending: 0, hold: 0, query: 0, totalOpenOrders: 0 }
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
        <div class="header">${org.name} - Open Orders Summary</div>
        <table>
          <thead>
            <tr>
              <th class="left">Date</th>
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
              <td class="font-bold">${fmt(row.totalOpenOrders)}</td>
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
              <td class="font-bold">${fmt(totals.totalOpenOrders)}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">Jan 1 to Today | ${data.length} working days</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send Open Orders Summary alert for a specific organization
 */
export async function sendOpenOrdersSummaryAlertForOrg(
  org: Organization,
  date: Date = new Date()
): Promise<void> {
  try {
    console.log(`\n📤 Sending Open Orders Summary alert for ${org.name}...`);

    const data = await fetchOpenOrdersDataForOrg(org.facilityId);

    if (data.length === 0) {
      console.log(`⚠️  No open orders data available for ${org.name}. Skipping alert.`);
      return;
    }

    // Generate HTML and convert to PNG via Puppeteer
    const imagePath = path.join(process.cwd(), `open-orders-${org.id}.png`);
    const html = generateHTML(org, data);
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

    // Upload to Slack - send to org's channel, fallback to test channel
    const channel = org.slackChannelId || TEST_CHANNEL;
    await uploadImageToSlack({
      imagePath,
      channel,
      title: `${org.name} - Open Orders Summary`,
      filename: `open-orders-${org.id}.png`,
      comment: `*${org.name} - Open Orders Summary*`,
      useOrgChannel: false,
      cleanup: true,
    });

    console.log(`✓ Successfully sent Open Orders Summary alert for ${org.name}`);
    console.log(`  Total open orders: ${data.reduce((sum, row) => sum + row.totalOpenOrders, 0)}`);
    console.log(`  Days included: ${data.length}`);
  } catch (error) {
    console.error(`❌ Error sending Open Orders Summary alert for ${org.name}:`, error);
    throw error;
  }
}

/**
 * Send Open Orders Summary alerts for all organizations
 */
export async function sendOpenOrdersSummaryAlerts(date: Date = new Date()): Promise<void> {
  console.log('🚀 Starting Open Orders Summary alerts...');
  console.log(`   Period: Jan 1 to ${date.toISOString().split('T')[0]}`);

  const results = await Promise.allSettled(
    ORGANIZATIONS.map((org) => sendOpenOrdersSummaryAlertForOrg(org, date))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Open Orders Summary Alerts Summary:');
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
const isDirectExecution = process.argv[1]?.includes('open-orders-summary-alert');
if (isDirectExecution) {
  sendOpenOrdersSummaryAlerts()
    .then(() => {
      console.log('✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}
