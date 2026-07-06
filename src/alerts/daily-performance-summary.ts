import puppeteer from 'puppeteer';
import { WebClient } from '@slack/web-api';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const IMAGE_PATH = path.join(process.cwd(), 'daily-performance-summary.png');

interface PerformanceRow {
  date: string;
  ordersWorked: number;
  authByRisa: number;
  narAofRest: number;
  activeTeamMembers: number;
  orderPerPerson: number;
}

async function fetchPerformanceData(): Promise<PerformanceRow[]> {
  // TODO: Replace with actual data from your source
  // For now, using sample data
  return [
    {
      date: '01/11/2026',
      ordersWorked: 559,
      authByRisa: 350,
      narAofRest: 209,
      activeTeamMembers: 5,
      orderPerPerson: 111.8
    },
    {
      date: '01/10/2026',
      ordersWorked: 0,
      authByRisa: 0,
      narAofRest: 0,
      activeTeamMembers: 0,
      orderPerPerson: 0
    },
    {
      date: '01/09/2026',
      ordersWorked: 1670,
      authByRisa: 1050,
      narAofRest: 620,
      activeTeamMembers: 31,
      orderPerPerson: 53.9
    },
    {
      date: '01/08/2026',
      ordersWorked: 1615,
      authByRisa: 1015,
      narAofRest: 600,
      activeTeamMembers: 32,
      orderPerPerson: 50.5
    },
    {
      date: '01/07/2026',
      ordersWorked: 1816,
      authByRisa: 1140,
      narAofRest: 676,
      activeTeamMembers: 32,
      orderPerPerson: 56.8
    },
    {
      date: '01/06/2026',
      ordersWorked: 1450,
      authByRisa: 910,
      narAofRest: 540,
      activeTeamMembers: 31,
      orderPerPerson: 46.8
    },
    {
      date: '01/05/2026',
      ordersWorked: 1697,
      authByRisa: 1065,
      narAofRest: 632,
      activeTeamMembers: 32,
      orderPerPerson: 53.0
    }
  ];
}

function calculateAverages(data: PerformanceRow[]): { l7d: PerformanceRow; l30d: PerformanceRow } {
  const totalOrders = data.reduce((sum, row) => sum + row.ordersWorked, 0);
  const totalAuth = data.reduce((sum, row) => sum + row.authByRisa, 0);
  const totalRest = data.reduce((sum, row) => sum + row.narAofRest, 0);
  const totalTeam = data.reduce((sum, row) => sum + row.activeTeamMembers, 0);
  const count = data.length;

  const avgOrderPerPerson = totalTeam > 0 ? totalOrders / totalTeam : 0;

  return {
    l7d: {
      date: 'L7D Average',
      ordersWorked: Math.round(totalOrders / count),
      authByRisa: Math.round(totalAuth / count),
      narAofRest: Math.round(totalRest / count),
      activeTeamMembers: Math.round(totalTeam / count),
      orderPerPerson: parseFloat(avgOrderPerPerson.toFixed(1))
    },
    l30d: {
      date: 'L30D Average',
      ordersWorked: Math.round(totalOrders / count),
      authByRisa: Math.round(totalAuth / count),
      narAofRest: Math.round(totalRest / count),
      activeTeamMembers: Math.round(totalTeam / count),
      orderPerPerson: parseFloat(avgOrderPerPerson.toFixed(1))
    }
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
          padding: 40px;
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
              <th>NAR, AoF & Rest</th>
              <th>Active Team Member</th>
              <th>Order per Person</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                <td>${row.date}</td>
                <td class="font-bold">${row.ordersWorked.toLocaleString()}</td>
                <td>${row.authByRisa.toLocaleString()}</td>
                <td>${row.narAofRest.toLocaleString()}</td>
                <td>${row.activeTeamMembers}</td>
                <td>${row.orderPerPerson.toFixed(1)}</td>
              </tr>
            `).join('')}
            <tr class="avg-row">
              <td class="font-bold">${averages.l7d.date}</td>
              <td class="font-bold">${averages.l7d.ordersWorked.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.authByRisa.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.narAofRest.toLocaleString()}</td>
              <td class="font-bold">${averages.l7d.activeTeamMembers}</td>
              <td class="font-bold">${averages.l7d.orderPerPerson.toFixed(1)}</td>
            </tr>
            <tr class="avg-row">
              <td class="font-bold">${averages.l30d.date}</td>
              <td class="font-bold">${averages.l30d.ordersWorked.toLocaleString()}</td>
              <td class="font-bold">${averages.l30d.authByRisa.toLocaleString()}</td>
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
  console.log('🚀 Generating Daily Performance Summary image...');

  const html = generateTableHTML(data);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluate(() => document.fonts.ready);

    // Calculate the actual content height
    const contentHeight = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollHeight + 80 : 900;
    });

    // Set viewport to match content
    await page.setViewport({ width: 1400, height: contentHeight });

    await page.screenshot({
      path: IMAGE_PATH,
      type: 'png',
      fullPage: false
    });

    console.log(`✅ Daily Performance Summary image generated: ${IMAGE_PATH}`);
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
    initial_comment: `*Daily Performance Summary*\nGenerated at ${new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'full',
      timeStyle: 'short'
    })}`
  });

  console.log('✅ Image uploaded successfully!');
  console.log(`🔗 File URL: ${result.file?.permalink}`);

  // Clean up
  fs.unlinkSync(filePath);
  console.log('🧹 Cleaned up local file');
}

async function sendDailyPerformanceSummary() {
  try {
    console.log('🎯 Sending Daily Performance Summary...\n');

    const data = await fetchPerformanceData();
    const imagePath = await generateTableImage(data);
    await uploadToSlack(imagePath);

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run
console.log('Script starting...');
sendDailyPerformanceSummary()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

export { sendDailyPerformanceSummary };
