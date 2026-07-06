import 'dotenv/config';
import { google } from 'googleapis';
import { subDays } from 'date-fns';
import path from 'path';
import { generateImageFromHTML } from './utils/image-generator';
import { uploadImageToSlack } from './utils/slack-uploader';
import { SlackConfig } from './config/slack.config';

const SHEET_ID = process.env.VITE_UNIQUE_STATUS_SHEETS_ID || process.env.VITE_GOOGLE_SHEETS_ID;
const SHEET_NAME = 'business_metrics_daily';

interface DailySummary {
  created_at_date: string;
  facility_id: string;
  orders_completed: number;
  status_denial_by_risa: number;
  status_denial_after_query: number;
  status_existing_denial: number;
}

interface DenialTrackingRow {
  date: string;
  ordersCompleted: number;
  denialByRisa: number;
  denialAfterQuery: number;
  existingDenial: number;
  totalDenials: number;
  denialRate: number;
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
    range: `${SHEET_NAME}!A:R`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    return [];
  }

  const dataRows = rows.slice(1);

  // business_metrics_daily: A(0)=date, B(1)=facility_id, E(4)=orders_completed,
  // K(10)=denial_by_risa, L(11)=denial_after_query, M(12)=existing_denial
  const summaries: DailySummary[] = dataRows
    .map((row) => ({
      created_at_date: row[0] || '',
      facility_id: row[1] || '',
      orders_completed: parseInt(row[4] || '0'),
      status_denial_by_risa: parseInt(row[10] || '0'),
      status_denial_after_query: parseInt(row[11] || '0'),
      status_existing_denial: parseInt(row[12] || '0'),
    }))
    .filter((s) => s.created_at_date >= startDate && s.created_at_date <= endDate);

  return summaries;
}

async function fetchDenialTrackingData(): Promise<DenialTrackingRow[]> {
  const today = new Date();
  const last14Days = subDays(today, 14);
  const startDate = last14Days.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  console.log(`📅 Fetching denial tracking data from ${startDate} to ${endDate}`);

  const summaries = await fetchDailySummaries(startDate, endDate);

  // Group by date
  const byDate = new Map<string, DailySummary[]>();
  summaries.forEach((s) => {
    if (!byDate.has(s.created_at_date)) {
      byDate.set(s.created_at_date, []);
    }
    byDate.get(s.created_at_date)!.push(s);
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

      const daySummaries = byDate.get(date)!;

      const ordersCompleted = daySummaries.reduce((sum, s) => sum + s.orders_completed, 0);
      const denialByRisa = daySummaries.reduce((sum, s) => sum + s.status_denial_by_risa, 0);
      const denialAfterQuery = daySummaries.reduce((sum, s) => sum + s.status_denial_after_query, 0);
      const existingDenial = daySummaries.reduce((sum, s) => sum + s.status_existing_denial, 0);
      const totalDenials = denialByRisa + denialAfterQuery + existingDenial;
      const denialRate = ordersCompleted > 0 ? (totalDenials / ordersCompleted) * 100 : 0;

      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dateFormatted = dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });

      return {
        date: `${dayName}, ${dateFormatted}`,
        ordersCompleted,
        denialByRisa,
        denialAfterQuery,
        existingDenial,
        totalDenials,
        denialRate: parseFloat(denialRate.toFixed(1)),
      };
    })
    .filter((row): row is DenialTrackingRow => row !== null)
    .slice(0, 7);
}

function calculateAverages(data: DenialTrackingRow[]): { l7d: DenialTrackingRow; l30d: DenialTrackingRow } {
  const count = data.length;
  const totalCompleted = data.reduce((sum, row) => sum + row.ordersCompleted, 0);
  const totalDenialByRisa = data.reduce((sum, row) => sum + row.denialByRisa, 0);
  const totalDenialAfterQuery = data.reduce((sum, row) => sum + row.denialAfterQuery, 0);
  const totalExistingDenial = data.reduce((sum, row) => sum + row.existingDenial, 0);
  const totalDenials = data.reduce((sum, row) => sum + row.totalDenials, 0);

  const avgDenialRate = totalCompleted > 0 ? (totalDenials / totalCompleted) * 100 : 0;

  return {
    l7d: {
      date: 'L7D Avg',
      ordersCompleted: Math.round(totalCompleted / count),
      denialByRisa: Math.round(totalDenialByRisa / count),
      denialAfterQuery: Math.round(totalDenialAfterQuery / count),
      existingDenial: Math.round(totalExistingDenial / count),
      totalDenials: Math.round(totalDenials / count),
      denialRate: parseFloat(avgDenialRate.toFixed(1)),
    },
    l30d: {
      date: 'L30D Avg',
      ordersCompleted: Math.round(totalCompleted / count),
      denialByRisa: Math.round(totalDenialByRisa / count),
      denialAfterQuery: Math.round(totalDenialAfterQuery / count),
      existingDenial: Math.round(totalExistingDenial / count),
      totalDenials: Math.round(totalDenials / count),
      denialRate: parseFloat(avgDenialRate.toFixed(1)),
    },
  };
}

function generateTableHTML(data: DenialTrackingRow[]): string {
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
          <h1>Denial Tracking</h1>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders Completed</th>
              <th>Denial by RISA</th>
              <th>Denial After Query</th>
              <th>Existing Denial</th>
              <th>Total Denials</th>
              <th>Denial Rate %</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                <td>${row.date}</td>
                <td class="font-bold">${row.ordersCompleted.toLocaleString()}</td>
                <td>${row.denialByRisa.toLocaleString()}</td>
                <td>${row.denialAfterQuery.toLocaleString()}</td>
                <td>${row.existingDenial.toLocaleString()}</td>
                <td class="font-bold">${row.totalDenials.toLocaleString()}</td>
                <td class="font-bold">${row.denialRate.toFixed(1)}%</td>
              </tr>
            `
              )
              .join('')}
            <tr class="avg-row">
              <td class="font-bold">${averages.l7d.date}</td>
              <td class="font-bold">${averages.l7d.ordersCompleted.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.denialByRisa.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.denialAfterQuery.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.existingDenial.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.totalDenials.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.denialRate.toFixed(1)}%</td>
            </tr>
            <tr class="avg-row">
              <td class="font-bold">${averages.l30d.date}</td>
              <td class="font-bold">${averages.l30d.ordersCompleted.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.denialByRisa.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.denialAfterQuery.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.existingDenial.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.totalDenials.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.denialRate.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

export async function sendDenialTrackingAlert(): Promise<void> {
  try {
    console.log('🎯 Sending Denial Tracking Alert...\n');

    const data = await fetchDenialTrackingData();

    if (data.length === 0) {
      console.log('⚠️  No data found');
      return;
    }

    console.log(`\n✅ Fetched ${data.length} days of data`);

    // Generate HTML and image
    const html = generateTableHTML(data);
    const imagePath = path.join(process.cwd(), 'denial-tracking-alert.png');

    await generateImageFromHTML(html, {
      outputPath: imagePath,
      width: 1400,
      height: 900,
    });

    // Upload to Slack
    const channel = SlackConfig.getDefaultChannelId();
    await uploadImageToSlack({
      imagePath,
      channel,
      title: '📊 Denial Tracking',
      comment: `*Denial Tracking*\nGenerated at ${new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'short',
      })} IST`,
      useOrgChannel: false,
      cleanup: true,
    });

    console.log('\n✨ Denial Tracking Alert sent successfully!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Main execution
async function main() {
  await sendDenialTrackingAlert();
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}
