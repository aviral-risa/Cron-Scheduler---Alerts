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
const IMAGE_PATH = path.join(process.cwd(), 'daily-performance-real.png');

interface DailySummary {
  created_at_date: string;
  facility_id: string;
  total_orders: number;
  orders_assigned: number;
  orders_completed: number;
  status_auth_by_risa: number;
  status_auth_on_file: number;
  status_no_auth_required: number;
  status_denial_by_risa: number;
  status_denial_after_query: number;
  status_existing_denial: number;
  status_query: number;
  status_pending: number;
  status_hold: number;
  status_auth_required: number;
  status_other: number;
  last_updated_timestamp: string;
}

interface PerformanceRow {
  date: string;
  ordersWorked: number;
  authByRisa: number;
  pending: number;
  narAofRest: number;
  activeTeamMembers: number;
  orderPerPerson: number;
}

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
    range: `${SHEET_NAME}!A:X`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    return [];
  }

  const dataRows = rows.slice(1);

  // business_metrics_daily column layout:
  // A(0)=date, B(1)=facility_id, C(2)=total_orders, D(3)=orders_assigned, E(4)=orders_completed,
  // F(5)=orders_inprogress, G(6)=total_billable, H(7)=auth_by_risa, I(8)=auth_on_file,
  // J(9)=no_auth_required, K(10)=denial_by_risa, L(11)=denial_after_query, M(12)=existing_denial,
  // N(13)=query, O(14)=pending, P(15)=hold, Q(16)=auth_required, R(17)=other,
  // S(18)-V(21)=rates, W(22)=timestamp, X(23)=distinct_users
  const summaries: DailySummary[] = dataRows
    .map((row) => ({
      created_at_date: row[0] || '',
      facility_id: row[1] || '',
      total_orders: parseInt(row[2] || '0'),
      orders_assigned: parseInt(row[3] || '0'),
      orders_completed: parseInt(row[4] || '0'),
      status_auth_by_risa: parseInt(row[7] || '0'),
      status_auth_on_file: parseInt(row[8] || '0'),
      status_no_auth_required: parseInt(row[9] || '0'),
      status_denial_by_risa: parseInt(row[10] || '0'),
      status_denial_after_query: parseInt(row[11] || '0'),
      status_existing_denial: parseInt(row[12] || '0'),
      status_query: parseInt(row[13] || '0'),
      status_pending: parseInt(row[14] || '0'),
      status_hold: parseInt(row[15] || '0'),
      status_auth_required: parseInt(row[16] || '0'),
      status_other: parseInt(row[17] || '0'),
      last_updated_timestamp: row[22] || '',
    }))
    .filter((s) => s.created_at_date >= startDate && s.created_at_date <= endDate);

  return summaries;
}

async function fetchPersonMetrics(startDate: string, endDate: string): Promise<Map<string, number>> {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'person_hourly_performance!A:G',
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    return new Map();
  }

  const dataRows = rows.slice(1);
  const activeByDate = new Map<string, Set<string>>();

  dataRows.forEach((row) => {
    const date = row[2]; // created_at_date (column C)
    const provider = row[4]; // provider_name (column E)
    const workedCount = parseInt(row[6] || '0'); // worked_count (column G)

    if (date >= startDate && date <= endDate && workedCount >= 10) {
      if (!activeByDate.has(date)) {
        activeByDate.set(date, new Set());
      }
      activeByDate.get(date)!.add(provider);
    }
  });

  const result = new Map<string, number>();
  activeByDate.forEach((providers, date) => {
    result.set(date, providers.size);
  });

  return result;
}

async function fetchPerformanceData(): Promise<PerformanceRow[]> {
  const today = new Date();
  const last14Days = subDays(today, 14); // Fetch more days to ensure we get 7 weekdays
  const startDate = last14Days.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  console.log(`📅 Fetching data from ${startDate} to ${endDate}`);

  const summaries = await fetchDailySummaries(startDate, endDate);
  const personMetrics = await fetchPersonMetrics(startDate, endDate);

  // Group by date
  const byDate = new Map<string, DailySummary[]>();
  summaries.forEach((s) => {
    if (!byDate.has(s.created_at_date)) {
      byDate.set(s.created_at_date, []);
    }
    byDate.get(s.created_at_date)!.push(s);
  });

  const sortedDates = Array.from(byDate.keys()).sort().reverse(); // Latest first

  return sortedDates
    .map((date) => {
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null;
      }

      const daySummaries = byDate.get(date)!;

      const ordersWorked = daySummaries.reduce((sum, s) => sum + s.orders_completed, 0);
      const authByRisa = daySummaries.reduce((sum, s) => sum + s.status_auth_by_risa, 0);
      const authOnFile = daySummaries.reduce((sum, s) => sum + s.status_auth_on_file, 0);
      const noAuthRequired = daySummaries.reduce((sum, s) => sum + s.status_no_auth_required, 0);
      const denialByRisa = daySummaries.reduce((sum, s) => sum + s.status_denial_by_risa, 0);
      const denialAfterQuery = daySummaries.reduce((sum, s) => sum + s.status_denial_after_query, 0);
      const existingDenial = daySummaries.reduce((sum, s) => sum + s.status_existing_denial, 0);
      const query = daySummaries.reduce((sum, s) => sum + s.status_query, 0);
      const pending = daySummaries.reduce((sum, s) => sum + s.status_pending, 0);
      const hold = daySummaries.reduce((sum, s) => sum + s.status_hold, 0);
      const authRequired = daySummaries.reduce((sum, s) => sum + s.status_auth_required, 0);
      const other = daySummaries.reduce((sum, s) => sum + s.status_other, 0);

      // Pending includes: query, pending, hold, auth_required
      const pendingTotal = query + pending + hold + authRequired;

      // NAR, AoF & Rest includes everything else
      const narAofRest = noAuthRequired + authOnFile + denialByRisa + denialAfterQuery + existingDenial + other;

      const activeTeamMembers = personMetrics.get(date) || 0;
      const orderPerPerson = activeTeamMembers > 0 ? ordersWorked / activeTeamMembers : 0;

      // Format: "Mon, 01/06/2026"
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dateFormatted = dateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      return {
        date: `${dayName}, ${dateFormatted}`,
        ordersWorked,
        authByRisa,
        pending: pendingTotal,
        narAofRest,
        activeTeamMembers,
        orderPerPerson: parseFloat(orderPerPerson.toFixed(1)),
      };
    })
    .filter((row): row is PerformanceRow => row !== null)
    .slice(0, 7); // Take only the last 7 weekdays
}

function calculateAverages(data: PerformanceRow[]): { l7d: PerformanceRow; l30d: PerformanceRow } {
  const totalOrders = data.reduce((sum, row) => sum + row.ordersWorked, 0);
  const totalAuth = data.reduce((sum, row) => sum + row.authByRisa, 0);
  const totalPending = data.reduce((sum, row) => sum + row.pending, 0);
  const totalRest = data.reduce((sum, row) => sum + row.narAofRest, 0);
  const totalTeam = data.reduce((sum, row) => sum + row.activeTeamMembers, 0);
  const count = data.length;

  const avgOrderPerPerson = totalTeam > 0 ? totalOrders / totalTeam : 0;

  return {
    l7d: {
      date: 'L7D Avg',
      ordersWorked: Math.round(totalOrders / count),
      authByRisa: Math.round(totalAuth / count),
      pending: Math.round(totalPending / count),
      narAofRest: Math.round(totalRest / count),
      activeTeamMembers: Math.round(totalTeam / count),
      orderPerPerson: parseFloat(avgOrderPerPerson.toFixed(1)),
    },
    l30d: {
      date: 'L30D Avg',
      ordersWorked: Math.round(totalOrders / count),
      authByRisa: Math.round(totalAuth / count),
      pending: Math.round(totalPending / count),
      narAofRest: Math.round(totalRest / count),
      activeTeamMembers: Math.round(totalTeam / count),
      orderPerPerson: parseFloat(avgOrderPerPerson.toFixed(1)),
    },
  };
}

function generateTableHTML(data: PerformanceRow[]): string {
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
          <h1>Daily Performance Summary</h1>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders Worked</th>
              <th>Auth by RISA</th>
              <th>Pending</th>
              <th>NAR, AoF & Rest</th>
              <th>Active Team Member</th>
              <th>Order per Person</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                <td>${row.date}</td>
                <td class="font-bold">${row.ordersWorked.toLocaleString()}</td>
                <td>${row.authByRisa.toLocaleString()}</td>
                <td>${row.pending.toLocaleString()}</td>
                <td>${row.narAofRest.toLocaleString()}</td>
                <td>${row.activeTeamMembers}</td>
                <td>${row.orderPerPerson.toFixed(1)}</td>
              </tr>
            `
              )
              .join('')}
            <tr class="avg-row">
              <td class="font-bold">${averages.l7d.date}</td>
              <td class="font-bold">${averages.l7d.ordersWorked.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.authByRisa.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.pending.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.narAofRest.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.activeTeamMembers}</td>
              <td class="font-bold">${averages.l7d.orderPerPerson.toFixed(1)}</td>
            </tr>
            <tr class="avg-row">
              <td class="font-bold">${averages.l30d.date}</td>
              <td class="font-bold">${averages.l30d.ordersWorked.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.authByRisa.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.pending.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.narAofRest.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.activeTeamMembers}</td>
              <td class="font-bold">${averages.l30d.orderPerPerson.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

async function generateTableImage(data: PerformanceRow[]): Promise<string> {
  console.log('🚀 Generating table image...');

  const html = generateTableHTML(data);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluate(() => document.fonts.ready);

    const contentHeight = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollHeight + 40 : 900;
    });

    await page.setViewport({ width: 1400, height: contentHeight });

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
    filename: 'daily-performance-summary.png',
    title: '📊 Daily Performance Summary',
    initial_comment: `*Daily Performance Summary - REAL DATA*\nGenerated at ${new Date().toLocaleString('en-US', {
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

async function sendRealPerformanceAlert() {
  try {
    console.log('🎯 Sending REAL Daily Performance Summary...\n');

    const data = await fetchPerformanceData();

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
sendRealPerformanceAlert()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

export { sendRealPerformanceAlert };
