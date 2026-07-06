import 'dotenv/config';
import { subDays, format } from 'date-fns';
import { getBusinessMetricsForRange, getWorkingDaysInRange } from '../services/sheets-dual';
import { filterByWorkingDays } from '../utils/businessMetrics';
import { FACILITY_IDS } from '../config/organizations';
import puppeteer from 'puppeteer';
import { uploadImageToSlack } from './utils/slack-uploader';
import type { BusinessMetricsDaily } from '../types/orders';
import path from 'path';

const TEST_CHANNEL = 'C0ADHS3NWLD';
const IMAGE_PATH = path.join(process.cwd(), 'medonc-daily-business-summary.png');

interface L0OutputRow {
  date: string;
  ordersBilled: number;
  authByRisa: number;
  narAofRest: number;
  activeTeamMembers: number;
  opd: number;
}

/**
 * Fetch last 14 calendar days of business_metrics_daily, filter to working days,
 * aggregate across all facilities per date, and return the last 7 working days.
 */
async function fetchL0Data(): Promise<L0OutputRow[]> {
  const yesterday = subDays(new Date(), 1); // exclude today (incomplete)
  const start = subDays(yesterday, 20); // fetch extra to guarantee 7 working days
  const startDate = format(start, 'yyyy-MM-dd');
  const endDate = format(yesterday, 'yyyy-MM-dd');

  console.log(`Fetching business_metrics_daily from ${startDate} to ${endDate}...`);

  const [metrics, workingDayConfigs] = await Promise.all([
    getBusinessMetricsForRange(FACILITY_IDS, startDate, endDate),
    getWorkingDaysInRange(startDate, endDate),
  ]);

  // Filter to working days only (exclude weekends/holidays)
  const filtered = filterByWorkingDays(
    metrics,
    workingDayConfigs,
    false
  ) as BusinessMetricsDaily[];

  // Group by date and sum across all facilities
  const byDate = new Map<
    string,
    { ordersBilled: number; authByRisa: number; activeTeamMembers: number }
  >();

  for (const m of filtered) {
    const existing = byDate.get(m.created_at_date) || {
      ordersBilled: 0,
      authByRisa: 0,
      activeTeamMembers: 0,
    };
    existing.ordersBilled += m.total_billable_orders;
    existing.authByRisa += m.status_auth_by_risa;
    existing.activeTeamMembers += m.distinct_users_worked;
    byDate.set(m.created_at_date, existing);
  }

  // Sort dates descending and take last 7 working days
  const sortedDates = Array.from(byDate.keys()).sort().reverse();
  const last7 = sortedDates.slice(0, 7);

  // Build rows (most recent first)
  const rows: L0OutputRow[] = last7.map((date) => {
    const d = byDate.get(date)!;
    const narAofRest = d.ordersBilled - d.authByRisa;
    const opd = d.activeTeamMembers > 0 ? d.ordersBilled / d.activeTeamMembers : 0;

    const dateObj = new Date(date + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFormatted = dateObj.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

    return {
      date: `${dayName}, ${dateFormatted}`,
      ordersBilled: d.ordersBilled,
      authByRisa: d.authByRisa,
      narAofRest,
      activeTeamMembers: d.activeTeamMembers,
      opd: parseFloat(opd.toFixed(1)),
    };
  });

  return rows;
}

function calculateL7DAverage(data: L0OutputRow[]): L0OutputRow {
  const count = data.length;
  if (count === 0) {
    return { date: 'L7D Avg', ordersBilled: 0, authByRisa: 0, narAofRest: 0, activeTeamMembers: 0, opd: 0 };
  }

  const totalBilled = data.reduce((s, r) => s + r.ordersBilled, 0);
  const totalAuth = data.reduce((s, r) => s + r.authByRisa, 0);
  const totalNar = data.reduce((s, r) => s + r.narAofRest, 0);
  const totalTeam = data.reduce((s, r) => s + r.activeTeamMembers, 0);

  const avgOpd = totalTeam > 0 ? totalBilled / totalTeam : 0;

  return {
    date: 'L7D Avg',
    ordersBilled: Math.round(totalBilled / count),
    authByRisa: Math.round(totalAuth / count),
    narAofRest: Math.round(totalNar / count),
    activeTeamMembers: Math.round(totalTeam / count),
    opd: parseFloat(avgOpd.toFixed(1)),
  };
}

function generateHTML(data: L0OutputRow[]): string {
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
          max-width: 1200px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
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
              <th>Orders Billed</th>
              <th>Auth by RISA</th>
              <th>NAR, AoF & Rest</th>
              <th>Active Team Member</th>
              <th>OPD</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
            <tr>
              <td>${row.date}</td>
              <td class="font-bold">${row.ordersBilled.toLocaleString()}</td>
              <td>${row.authByRisa.toLocaleString()}</td>
              <td>${row.narAofRest.toLocaleString()}</td>
              <td>${row.activeTeamMembers}</td>
              <td>${row.opd.toFixed(1)}</td>
            </tr>
            `
              )
              .join('')}
            <tr class="avg-row">
              <td class="font-bold">${avg.date}</td>
              <td class="font-bold">${avg.ordersBilled.toLocaleString()}</td>
              <td class="font-bold">${avg.authByRisa.toLocaleString()}</td>
              <td class="font-bold">${avg.narAofRest.toLocaleString()}</td>
              <td class="font-bold">${avg.activeTeamMembers}</td>
              <td class="font-bold">${avg.opd.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

export async function sendL0BusinessOutputAlert(): Promise<void> {
  try {
    console.log('Sending Daily Orders Billed...\n');

    const data = await fetchL0Data();

    if (data.length === 0) {
      console.log('No data found for Daily Orders Billed');
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
      await page.setViewport({ width: 1200, height: 800 });
      await page.evaluate(() => document.fonts.ready);

      const contentHeight = await page.evaluate(() => {
        const container = document.querySelector('.container');
        return container ? container.scrollHeight + 40 : 800;
      });
      await page.setViewport({ width: 1200, height: contentHeight });

      await page.screenshot({ path: IMAGE_PATH, type: 'png', fullPage: false });
      imagePath = IMAGE_PATH;
      console.log(`Image generated: ${imagePath}`);
    } finally {
      await browser.close();
    }

    // Upload to Slack test channel
    await uploadImageToSlack({
      imagePath,
      channel: TEST_CHANNEL,
      title: 'Daily Orders Billed',
      filename: 'medonc-daily-business-summary.png',
      comment: '*Daily Orders Billed*',
      useOrgChannel: false,
      cleanup: true,
    });

    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error);
    throw error;
  }
}
