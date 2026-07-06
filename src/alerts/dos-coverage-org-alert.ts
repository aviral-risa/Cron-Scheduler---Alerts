/**
 * DoS Coverage - Organisation Level Slack Alert
 * Sends per-organization DoS coverage breakdown as PNG images
 * Separate from the combined DoS Coverage alert
 */

import 'dotenv/config';
import { subDays, format } from 'date-fns';
import { getPayerTreatmentAgingForRange } from '../services/sheets-dual';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import puppeteer from 'puppeteer';
import { uploadImageToSlack } from './utils/slack-uploader';
import type { DosCoverageRow } from '../types/dosCoverage';
import path from 'path';

const TEST_CHANNEL = 'C0ADHS3NWLD';

/**
 * Fetch last 7 working days of DoS coverage data for a specific facility
 */
async function fetchDosCoverageDataForOrg(facilityId: string): Promise<DosCoverageRow[]> {
  const yesterday = subDays(new Date(), 1);
  const start = subDays(yesterday, 20); // fetch extra to cover 7 working days
  const startDate = format(start, 'yyyy-MM-dd');
  const endDate = format(yesterday, 'yyyy-MM-dd');

  console.log(`  Fetching DoS coverage for facility ${facilityId} from ${startDate} to ${endDate}...`);

  const payerRows = await getPayerTreatmentAgingForRange([facilityId], startDate, endDate);
  console.log(`  Sheet rows: ${payerRows.length}`);

  // Aggregate by date
  const dateMap = new Map<string, DosCoverageRow>();

  for (const pr of payerRows) {
    const existing = dateMap.get(pr.created_at_date) || {
      date: pr.created_at_date,
      totalOrders: 0,
      bucket0to7: 0, bucket8to14: 0, bucket15to21: 0, bucket21plus: 0,
      ordersWorked: 0,
      worked0to7: 0, worked8to14: 0, worked15to21: 0, worked21plus: 0,
    };
    existing.totalOrders += pr.total_orders_loaded;
    existing.bucket0to7 += pr.loaded_0_to_7;
    existing.bucket8to14 += pr.loaded_8_to_14;
    existing.bucket15to21 += pr.loaded_15_to_21;
    existing.bucket21plus += pr.loaded_21_plus;
    existing.ordersWorked += pr.total_orders_billed;
    existing.worked0to7 += pr.billed_0_to_7;
    existing.worked8to14 += pr.billed_8_to_14;
    existing.worked15to21 += pr.billed_15_to_21;
    existing.worked21plus += pr.billed_21_plus;
    dateMap.set(pr.created_at_date, existing);
  }

  // Filter out weekends
  const weekdayRows = Array.from(dateMap.values()).filter(row => {
    const dateObj = new Date(row.date + 'T00:00:00');
    const day = dateObj.getDay();
    return day !== 0 && day !== 6; // Exclude Sunday (0) and Saturday (6)
  });

  // Sort descending and take last 7 working days
  const sorted = weekdayRows.sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.slice(0, 7);

  console.log(`  Aggregated to ${last7.length} date rows`);
  return last7;
}

function generateHTML(orgName: string, data: DosCoverageRow[]): string {
  const totals: DosCoverageRow = {
    date: 'TOTAL',
    totalOrders: data.reduce((s, r) => s + r.totalOrders, 0),
    bucket0to7: data.reduce((s, r) => s + r.bucket0to7, 0),
    bucket8to14: data.reduce((s, r) => s + r.bucket8to14, 0),
    bucket15to21: data.reduce((s, r) => s + r.bucket15to21, 0),
    bucket21plus: data.reduce((s, r) => s + r.bucket21plus, 0),
    ordersWorked: data.reduce((s, r) => s + r.ordersWorked, 0),
    worked0to7: data.reduce((s, r) => s + r.worked0to7, 0),
    worked8to14: data.reduce((s, r) => s + r.worked8to14, 0),
    worked15to21: data.reduce((s, r) => s + r.worked15to21, 0),
    worked21plus: data.reduce((s, r) => s + r.worked21plus, 0),
  };

  const formatDate = (dateStr: string) => {
    if (dateStr === 'TOTAL') return 'TOTAL';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const fmt = (n: number) => n.toLocaleString();
  const pct = (worked: number, loaded: number) => loaded > 0 ? `${((worked / loaded) * 100).toFixed(1)}%` : '0%';

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
          max-width: 1400px;
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
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        th.left { text-align: left; }
        th.group-header {
          background: #eef2ff;
          color: #4338ca;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #c7d2fe;
        }
        td {
          padding: 10px 12px;
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
        .border-r { border-right: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">${orgName} - DoS Coverage</div>
        <table>
          <thead>
            <tr>
              <th rowspan="2" class="left border-r">Date</th>
              <th rowspan="2" class="border-r">Total Orders</th>
              <th colspan="4" class="group-header border-r">Loaded by DoS Bucket</th>
              <th rowspan="2" class="border-r">% Worked</th>
              <th colspan="4" class="group-header">% Worked by DoS Bucket</th>
            </tr>
            <tr>
              <th>T+0-7</th>
              <th>T+8-14</th>
              <th>T+15-21</th>
              <th class="border-r">T+21+</th>
              <th>T+0-7</th>
              <th>T+8-14</th>
              <th>T+15-21</th>
              <th>T+21+</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
            <tr>
              <td class="left border-r">${formatDate(row.date)}</td>
              <td class="font-bold border-r">${fmt(row.totalOrders)}</td>
              <td>${fmt(row.bucket0to7)}</td>
              <td>${fmt(row.bucket8to14)}</td>
              <td>${fmt(row.bucket15to21)}</td>
              <td class="border-r">${fmt(row.bucket21plus)}</td>
              <td class="font-bold border-r">${pct(row.ordersWorked, row.totalOrders)}</td>
              <td>${pct(row.worked0to7, row.bucket0to7)}</td>
              <td>${pct(row.worked8to14, row.bucket8to14)}</td>
              <td>${pct(row.worked15to21, row.bucket15to21)}</td>
              <td>${pct(row.worked21plus, row.bucket21plus)}</td>
            </tr>
            `
              )
              .join('')}
            <tr class="total-row">
              <td class="font-bold left border-r">TOTAL</td>
              <td class="font-bold border-r">${fmt(totals.totalOrders)}</td>
              <td class="font-bold">${fmt(totals.bucket0to7)}</td>
              <td class="font-bold">${fmt(totals.bucket8to14)}</td>
              <td class="font-bold">${fmt(totals.bucket15to21)}</td>
              <td class="font-bold border-r">${fmt(totals.bucket21plus)}</td>
              <td class="font-bold border-r">${pct(totals.ordersWorked, totals.totalOrders)}</td>
              <td class="font-bold">${pct(totals.worked0to7, totals.bucket0to7)}</td>
              <td class="font-bold">${pct(totals.worked8to14, totals.bucket8to14)}</td>
              <td class="font-bold">${pct(totals.worked15to21, totals.bucket15to21)}</td>
              <td class="font-bold">${pct(totals.worked21plus, totals.bucket21plus)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send DoS Coverage alert for a specific organization
 */
export async function sendDosCoverageOrgAlert(org: Organization): Promise<void> {
  try {
    console.log(`\n📤 Sending DoS Coverage alert for ${org.name}...`);

    const data = await fetchDosCoverageDataForOrg(org.facilityId);

    if (data.length === 0) {
      console.log(`⚠️  No DoS coverage data available for ${org.name}. Skipping.`);
      return;
    }

    // Generate HTML and convert to PNG via Puppeteer
    const imagePath = path.join(process.cwd(), `dos-coverage-${org.id}.png`);
    const html = generateHTML(org.name, data);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html);
      await page.setViewport({ width: 1400, height: 800 });
      await page.evaluate(() => document.fonts.ready);

      const contentHeight = await page.evaluate(() => {
        const container = document.querySelector('.container');
        return container ? container.scrollHeight + 40 : 800;
      });
      await page.setViewport({ width: 1400, height: contentHeight });

      await page.screenshot({ path: imagePath, type: 'png', fullPage: false });
      console.log(`  Image generated: ${imagePath}`);
    } finally {
      await browser.close();
    }

    // Upload to Slack - send to org's channel, fallback to test channel
    const channel = org.slackChannelId || TEST_CHANNEL;
    await uploadImageToSlack({
      imagePath,
      channel,
      title: `${org.name} - DoS Coverage`,
      filename: `dos-coverage-${org.id}.png`,
      comment: `*${org.name} - DoS Coverage*`,
      useOrgChannel: false,
      cleanup: true,
    });

    console.log(`✓ Successfully sent DoS Coverage alert for ${org.name}`);
  } catch (error) {
    console.error(`❌ Error sending DoS Coverage alert for ${org.name}:`, error);
    throw error;
  }
}

/**
 * Send DoS Coverage alerts for all organizations
 */
export async function sendDosCoverageOrgAlerts(): Promise<void> {
  console.log('🚀 Starting DoS Coverage Org-Level alerts...');

  const results = await Promise.allSettled(
    ORGANIZATIONS.map((org) => sendDosCoverageOrgAlert(org))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 DoS Coverage Org-Level Alerts Summary:');
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
const isDirectExecution = process.argv[1]?.includes('dos-coverage-org-alert');
if (isDirectExecution) {
  sendDosCoverageOrgAlerts()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}
