import 'dotenv/config';
import { subDays, format } from 'date-fns';
import puppeteer from 'puppeteer';
import path from 'path';
import { getBusinessMetricsForRange, getWorkingDaysInRange } from '../services/sheets-dual';
import { filterByWorkingDays } from '../utils/businessMetrics';
import { getMedOncFacilityIds } from '../config/organizations';
import { uploadImageToSlack } from './utils/slack-uploader';
import type { BusinessMetricsDaily } from '../types/orders';

const TEST_CHANNEL = 'C0ADHS3NWLD';
const IMAGE_PATH = path.join(process.cwd(), 'medonc-approval-rate-trending.png');

interface ApprovalRateTrendingRow {
  date: string;
  totalAuthInitiated: number;
  authByRisa: number;
  denialByRisa: number;
  denialAfterQuery: number;
  paApprovalRate: number;
  overallApprovalRate: number;
}

async function fetchApprovalRateData(): Promise<ApprovalRateTrendingRow[]> {
  const yesterday = subDays(new Date(), 1); // exclude today (incomplete)
  const start = subDays(yesterday, 20); // fetch extra to guarantee 7 working days
  const startDate = format(start, 'yyyy-MM-dd');
  const endDate = format(yesterday, 'yyyy-MM-dd');

  console.log(`Fetching business_metrics_daily from ${startDate} to ${endDate}...`);

  const [metrics, workingDayConfigs] = await Promise.all([
    getBusinessMetricsForRange(getMedOncFacilityIds(), startDate, endDate),
    getWorkingDaysInRange(startDate, endDate),
  ]);

  // Filter to working days only
  const filtered = filterByWorkingDays(
    metrics,
    workingDayConfigs,
    false
  ) as BusinessMetricsDaily[];

  // Group by date and sum across all facilities
  const byDate = new Map<
    string,
    { authByRisa: number; denialByRisa: number; denialAfterQuery: number }
  >();

  for (const m of filtered) {
    const existing = byDate.get(m.created_at_date) || {
      authByRisa: 0,
      denialByRisa: 0,
      denialAfterQuery: 0,
    };
    existing.authByRisa += m.status_auth_by_risa;
    existing.denialByRisa += m.status_denial_by_risa;
    existing.denialAfterQuery += m.status_denial_after_query;
    byDate.set(m.created_at_date, existing);
  }

  // Sort dates descending and take last 7 working days
  const sortedDates = Array.from(byDate.keys()).sort().reverse();
  const last7 = sortedDates.slice(0, 7);

  return last7.map((date) => {
    const d = byDate.get(date)!;
    const totalAuthInitiated = d.authByRisa + d.denialByRisa + d.denialAfterQuery;
    const paApprovalRate =
      d.authByRisa + d.denialByRisa > 0
        ? parseFloat(((d.authByRisa / (d.authByRisa + d.denialByRisa)) * 100).toFixed(1))
        : 0;
    const overallApprovalRate =
      totalAuthInitiated > 0
        ? parseFloat(((d.authByRisa / totalAuthInitiated) * 100).toFixed(1))
        : 0;

    const dateObj = new Date(date + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFormatted = dateObj.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

    return {
      date: `${dayName}, ${dateFormatted}`,
      totalAuthInitiated,
      authByRisa: d.authByRisa,
      denialByRisa: d.denialByRisa,
      denialAfterQuery: d.denialAfterQuery,
      paApprovalRate,
      overallApprovalRate,
    };
  });
}

function calculateL7DAverage(data: ApprovalRateTrendingRow[]): ApprovalRateTrendingRow {
  const count = data.length;
  if (count === 0) {
    return {
      date: 'L7D Avg',
      totalAuthInitiated: 0,
      authByRisa: 0,
      denialByRisa: 0,
      denialAfterQuery: 0,
      paApprovalRate: 0,
      overallApprovalRate: 0,
    };
  }

  const totalAuthByRisa = data.reduce((s, r) => s + r.authByRisa, 0);
  const totalDenialByRisa = data.reduce((s, r) => s + r.denialByRisa, 0);
  const totalDenialAfterQuery = data.reduce((s, r) => s + r.denialAfterQuery, 0);
  const totalAuthInitiated = data.reduce((s, r) => s + r.totalAuthInitiated, 0);

  const paApprovalRate =
    totalAuthByRisa + totalDenialByRisa > 0
      ? parseFloat(((totalAuthByRisa / (totalAuthByRisa + totalDenialByRisa)) * 100).toFixed(1))
      : 0;
  const overallApprovalRate =
    totalAuthInitiated > 0
      ? parseFloat(((totalAuthByRisa / totalAuthInitiated) * 100).toFixed(1))
      : 0;

  return {
    date: 'L7D Avg',
    totalAuthInitiated: Math.round(totalAuthInitiated / count),
    authByRisa: Math.round(totalAuthByRisa / count),
    denialByRisa: Math.round(totalDenialByRisa / count),
    denialAfterQuery: Math.round(totalDenialAfterQuery / count),
    paApprovalRate,
    overallApprovalRate,
  };
}

function generateHTML(data: ApprovalRateTrendingRow[]): string {
  const avg = calculateL7DAverage(data);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
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
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          table-layout: fixed;
        }
        th {
          background: #f9fafb;
          color: #6b7280;
          font-weight: 600;
          font-size: 13px;
          text-align: left;
          padding: 12px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        td {
          padding: 14px 24px;
          font-size: 14px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        .avg-row {
          background-color: #fef3c7;
        }
        .avg-row td {
          font-weight: 600;
          border-bottom: none;
        }
        .font-bold {
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total Auth Initiated</th>
              <th>Auth by RISA</th>
              <th>Denial by RISA</th>
              <th>Denial After Query</th>
              <th>RISA Approval Rate</th>
              <th>Overall Approval Rate</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
            <tr>
              <td>${row.date}</td>
              <td class="font-bold">${row.totalAuthInitiated.toLocaleString()}</td>
              <td>${row.authByRisa.toLocaleString()}</td>
              <td>${row.denialByRisa.toLocaleString()}</td>
              <td>${row.denialAfterQuery.toLocaleString()}</td>
              <td class="font-bold">${row.paApprovalRate.toFixed(1)}%</td>
              <td class="font-bold">${row.overallApprovalRate.toFixed(1)}%</td>
            </tr>
            `
              )
              .join('')}
            <tr class="avg-row">
              <td class="font-bold">${avg.date}</td>
              <td class="font-bold">${avg.totalAuthInitiated.toLocaleString()}</td>
              <td class="font-bold">${avg.authByRisa.toLocaleString()}</td>
              <td class="font-bold">${avg.denialByRisa.toLocaleString()}</td>
              <td class="font-bold">${avg.denialAfterQuery.toLocaleString()}</td>
              <td class="font-bold">${avg.paApprovalRate.toFixed(1)}%</td>
              <td class="font-bold">${avg.overallApprovalRate.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

export async function sendApprovalRateTrendingAlert(): Promise<void> {
  try {
    console.log('Sending Approval Rate...\n');

    const data = await fetchApprovalRateData();

    if (data.length === 0) {
      console.log('No data found for Approval Rate');
      return;
    }

    console.log(`Fetched ${data.length} working days of data`);

    // Generate HTML and convert to PNG via Puppeteer
    const html = generateHTML(data);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    let imagePath: string;
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

      await page.screenshot({ path: IMAGE_PATH, type: 'png', fullPage: false });
      imagePath = IMAGE_PATH;
      console.log(`Image generated: ${imagePath}`);
    } finally {
      await browser.close();
    }

    // Upload to Slack
    await uploadImageToSlack({
      imagePath,
      channel: TEST_CHANNEL,
      title: 'Approval Rate',
      filename: 'medonc-approval-rate-trending.png',
      comment: '*Approval Rate*',
      useOrgChannel: false,
      cleanup: true,
    });

    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error);
    throw error;
  }
}
