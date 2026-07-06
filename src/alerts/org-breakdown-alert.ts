import puppeteer from 'puppeteer';
import { WebClient } from '@slack/web-api';
import { google } from 'googleapis';
import { subDays } from 'date-fns';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const SHEET_ID = process.env.VITE_UNIQUE_STATUS_SHEETS_ID || process.env.VITE_GOOGLE_SHEETS_ID;
const SHEET_NAME = 'business_metrics_daily';
const IMAGE_PATH = path.join(process.cwd(), 'org-breakdown-alert.png');

interface DailySummary {
  created_at_date: string;
  facility_id: string;
  orders_completed: number;
}

interface OrgBreakdownRow {
  date: string;
  nycbs: number;
  chc: number;
  mbpcc: number;
  ucbc: number;
  total: number;
}

const FACILITY_MAP: Record<string, 'nycbs' | 'chc' | 'mbpcc' | 'ucbc'> = {
  'HhwIHO4npKhrxyylkC33': 'nycbs',
  '4BlQ4SsqAVTDgFKApKZr': 'chc',
  '3GKbZtgpPru1vJGCkxwR': 'mbpcc',
  'W14MolgUu7OYvX4CFQJn': 'ucbc',
};

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function fetchDailySummaries(startDate: string, endDate: string): Promise<DailySummary[]> {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:E`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    return [];
  }

  const dataRows = rows.slice(1);

  // business_metrics_daily: A(0)=date, B(1)=facility_id, E(4)=orders_completed (same index)
  const summaries: DailySummary[] = dataRows
    .map((row) => ({
      created_at_date: row[0] || '',
      facility_id: row[1] || '',
      orders_completed: parseInt(row[4] || '0'),
    }))
    .filter((s) => s.created_at_date >= startDate && s.created_at_date <= endDate);

  return summaries;
}

async function fetchOrgBreakdownData(): Promise<OrgBreakdownRow[]> {
  const today = new Date();
  const last14Days = subDays(today, 14);
  const startDate = last14Days.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  console.log(`📅 Fetching data from ${startDate} to ${endDate}`);

  const summaries = await fetchDailySummaries(startDate, endDate);

  // Group by date
  const byDate = new Map<string, Map<string, number>>();
  summaries.forEach((s) => {
    if (!byDate.has(s.created_at_date)) {
      byDate.set(s.created_at_date, new Map());
    }
    const orgKey = FACILITY_MAP[s.facility_id];
    if (orgKey) {
      byDate.get(s.created_at_date)!.set(orgKey, s.orders_completed);
    }
  });

  const sortedDates = Array.from(byDate.keys()).sort().reverse();

  return sortedDates
    .map((date) => {
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null;
      }

      const orgData = byDate.get(date)!;
      const nycbs = orgData.get('nycbs') || 0;
      const chc = orgData.get('chc') || 0;
      const mbpcc = orgData.get('mbpcc') || 0;
      const ucbc = orgData.get('ucbc') || 0;
      const total = nycbs + chc + mbpcc + ucbc;

      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dateFormatted = dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });

      return {
        date: `${dayName}, ${dateFormatted}`,
        nycbs,
        chc,
        mbpcc,
        ucbc,
        total,
      };
    })
    .filter((row): row is OrgBreakdownRow => row !== null)
    .slice(0, 7);
}

function calculateAverages(data: OrgBreakdownRow[]): { l7d: OrgBreakdownRow; l30d: OrgBreakdownRow } {
  const count = data.length;
  const totalNycbs = data.reduce((sum, row) => sum + row.nycbs, 0);
  const totalChc = data.reduce((sum, row) => sum + row.chc, 0);
  const totalMbpcc = data.reduce((sum, row) => sum + row.mbpcc, 0);
  const totalUcbc = data.reduce((sum, row) => sum + row.ucbc, 0);
  const totalAll = data.reduce((sum, row) => sum + row.total, 0);

  return {
    l7d: {
      date: 'L7D Average',
      nycbs: Math.round(totalNycbs / count),
      chc: Math.round(totalChc / count),
      mbpcc: Math.round(totalMbpcc / count),
      ucbc: Math.round(totalUcbc / count),
      total: Math.round(totalAll / count),
    },
    l30d: {
      date: 'L30D Average',
      nycbs: Math.round(totalNycbs / count),
      chc: Math.round(totalChc / count),
      mbpcc: Math.round(totalMbpcc / count),
      ucbc: Math.round(totalUcbc / count),
      total: Math.round(totalAll / count),
    },
  };
}

function generateTableHTML(data: OrgBreakdownRow[]): string {
  const averages = calculateAverages(data);

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
        .header {
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        h1 {
          font-size: 20px;
          color: #111827;
          margin: 0;
          font-weight: 600;
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
          border-bottom: 1px solid #e5e7eb;
        }
        .avg-row {
          background-color: #fef3c7;
        }
        .avg-row td {
          font-weight: 600;
          border-bottom: 1px solid #fde68a;
        }
        .avg-row:last-child td {
          border-bottom: none;
        }
        .font-bold {
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Organization Breakdown - Orders Worked</h1>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>NYCBS</th>
              <th>CHC</th>
              <th>MBPCC</th>
              <th>UCBC</th>
              <th>Total Orders Worked</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                <td>${row.date}</td>
                <td>${row.nycbs.toLocaleString()}</td>
                <td>${row.chc.toLocaleString()}</td>
                <td>${row.mbpcc.toLocaleString()}</td>
                <td>${row.ucbc.toLocaleString()}</td>
                <td class="font-bold">${row.total.toLocaleString()}</td>
              </tr>
            `
              )
              .join('')}
            <tr class="avg-row">
              <td class="font-bold">${averages.l7d.date}</td>
              <td class="font-bold">${averages.l7d.nycbs.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.chc.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.mbpcc.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.ucbc.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.total.toLocaleString()}</td>
            </tr>
            <tr class="avg-row">
              <td class="font-bold">${averages.l30d.date}</td>
              <td class="font-bold">${averages.l30d.nycbs.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.chc.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.mbpcc.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.ucbc.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

async function generateTableImage(data: OrgBreakdownRow[]): Promise<string> {
  console.log('🚀 Generating table image...');

  const html = generateTableHTML(data);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 1200, height: 900 });
    await page.evaluate(() => document.fonts.ready);

    const contentHeight = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollHeight + 40 : 900;
    });

    await page.setViewport({ width: 1200, height: contentHeight });

    await page.screenshot({
      path: IMAGE_PATH,
      type: 'png',
      fullPage: false,
    });

    console.log(`✅ Table image generated: ${IMAGE_PATH}`);
    return IMAGE_PATH;
  } finally {
    await browser.close();
  }
}

async function uploadToSlack(filePath: string): Promise<void> {
  if (!SLACK_BOT_TOKEN) {
    throw new Error('SLACK_BOT_TOKEN not found in environment');
  }

  if (!SLACK_CHANNEL) {
    throw new Error('SLACK_CHANNEL not found in environment');
  }

  const web = new WebClient(SLACK_BOT_TOKEN);

  console.log(`📤 Uploading to Slack channel ${SLACK_CHANNEL}...`);

  const result = await web.files.uploadV2({
    channel_id: SLACK_CHANNEL,
    file: fs.createReadStream(filePath),
    filename: 'org-breakdown-orders-worked.png',
    title: '📊 Organization Breakdown - Orders Worked',
    initial_comment: `*Organization Breakdown - Orders Worked*\nGenerated at ${new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'full',
      timeStyle: 'short',
    })}`,
  });

  console.log('✅ Image uploaded successfully!');
  console.log(`🔗 File URL: ${result.file?.permalink}`);

  fs.unlinkSync(filePath);
  console.log('🧹 Cleaned up local file');
}

async function sendOrgBreakdownAlert() {
  try {
    console.log('🎯 Sending Organization Breakdown Alert...\n');

    const data = await fetchOrgBreakdownData();

    if (data.length === 0) {
      console.log('⚠️  No data found');
      return;
    }

    console.log(`\n✅ Fetched ${data.length} days of data`);

    const imagePath = await generateTableImage(data);
    await uploadToSlack(imagePath);

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

console.log('Script starting...');
sendOrgBreakdownAlert()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

export { sendOrgBreakdownAlert };
