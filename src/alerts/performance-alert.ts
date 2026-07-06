import puppeteer from 'puppeteer';
import { WebClient } from '@slack/web-api';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const IMAGE_PATH = path.join(process.cwd(), 'performance-table.png');

interface PerformanceData {
  date: string;
  ordersWorked: number;
  ordersLoaded: number;
  sevenDayAvg: number;
  variance: number;
  variancePercent: number;
  activePeople: number;
  ordersPerPerson: number;
}

async function fetchPerformanceData(): Promise<PerformanceData[]> {
  // TODO: Replace with actual data from your source
  return [
    {
      date: 'Sun, Jan 11',
      ordersWorked: 559,
      ordersLoaded: 3265,
      sevenDayAvg: 1468,
      variance: -909,
      variancePercent: -61.9,
      activePeople: 5,
      ordersPerPerson: 111.8
    },
    {
      date: 'Fri, Jan 9',
      ordersWorked: 1670,
      ordersLoaded: 3159,
      sevenDayAvg: 1650,
      variance: 20,
      variancePercent: 1.2,
      activePeople: 31,
      ordersPerPerson: 53.9
    },
    {
      date: 'Thu, Jan 8',
      ordersWorked: 1615,
      ordersLoaded: 3192,
      sevenDayAvg: 1645,
      variance: -30,
      variancePercent: -1.8,
      activePeople: 32,
      ordersPerPerson: 50.5
    },
    {
      date: 'Wed, Jan 7',
      ordersWorked: 1816,
      ordersLoaded: 4191,
      sevenDayAvg: 1654,
      variance: 162,
      variancePercent: 9.8,
      activePeople: 32,
      ordersPerPerson: 56.8
    },
    {
      date: 'Tue, Jan 6',
      ordersWorked: 1450,
      ordersLoaded: 2293,
      sevenDayAvg: 1574,
      variance: -124,
      variancePercent: -7.9,
      activePeople: 31,
      ordersPerPerson: 46.8
    },
    {
      date: 'Mon, Jan 5',
      ordersWorked: 1697,
      ordersLoaded: 2936,
      sevenDayAvg: 1697,
      variance: 0,
      variancePercent: 0.0,
      activePeople: 32,
      ordersPerPerson: 53.0
    }
  ];
}

function generateTableHTML(data: PerformanceData[]): string {
  const getRowClass = (variancePercent: number) => {
    if (variancePercent > 5) return 'bg-green-50';
    if (variancePercent < -5) return 'bg-red-50';
    return '';
  };

  const formatVariance = (value: number) => {
    return value >= 0 ? `+${value}` : `${value}`;
  };

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
          background: white;
        }
        .container {
          max-width: 1400px;
        }
        h1 {
          font-size: 28px;
          color: #1e293b;
          margin-bottom: 24px;
          font-weight: 600;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        th {
          background: #f8fafc;
          color: #475569;
          font-weight: 600;
          font-size: 14px;
          text-align: left;
          padding: 16px;
          border-bottom: 2px solid #e2e8f0;
        }
        td {
          padding: 16px;
          font-size: 14px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .bg-green-50 {
          background-color: #dcfce7 !important;
        }
        .bg-red-50 {
          background-color: #fee2e2 !important;
        }
        .font-bold {
          font-weight: 700;
        }
        .legend {
          margin-top: 20px;
          padding: 16px;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 13px;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Daily Performance Breakdown</h1>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders Worked</th>
              <th>Orders Loaded</th>
              <th>7-Day Avg</th>
              <th>Variance</th>
              <th>Variance %</th>
              <th>Active People</th>
              <th>Orders/Person</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr class="${getRowClass(row.variancePercent)}">
                <td>${row.date}</td>
                <td class="font-bold">${row.ordersWorked.toLocaleString()}</td>
                <td>${row.ordersLoaded.toLocaleString()}</td>
                <td>${row.sevenDayAvg.toLocaleString()}</td>
                <td>${formatVariance(row.variance)}</td>
                <td>${formatVariance(row.variancePercent)}%</td>
                <td>${row.activePeople}</td>
                <td>${row.ordersPerPerson.toFixed(1)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="legend">
          🟢 Above avg (>+5%) &nbsp;&nbsp;&nbsp; ⚪ Normal (±5%) &nbsp;&nbsp;&nbsp; 🔴 Below avg (<-5%)
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generateTableImage(data: PerformanceData[]): Promise<string> {
  console.log('🚀 Generating table image...');

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

    await page.screenshot({
      path: IMAGE_PATH,
      type: 'png',
      fullPage: true
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

  const web = new WebClient(SLACK_BOT_TOKEN);

  console.log('📤 Uploading to Slack...');

  // Try to find the channel by name
  try {
    const result = await web.conversations.list({
      types: 'public_channel,private_channel'
    });

    console.log('Found channels:');
    if (result.channels) {
      result.channels.forEach((ch: any) => {
        console.log(`  - ${ch.name} (${ch.id})`);
      });
    }

    // Find medonc-business-views channel
    const channel = result.channels?.find((ch: any) =>
      ch.name === 'medonc-business-views' || ch.name === 'alerts'
    );

    if (channel) {
      console.log(`\n✅ Found channel: ${channel.name} (${channel.id})`);

      const uploadResult = await web.files.uploadV2({
        channel_id: channel.id,
        file: fs.createReadStream(filePath),
        filename: 'daily-performance-breakdown.png',
        title: '📊 Daily Performance Breakdown',
        initial_comment: `*Daily Performance Report*\nGenerated at ${new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          dateStyle: 'full',
          timeStyle: 'short'
        })}`
      });

      console.log('✅ Image uploaded successfully!');
      console.log(`🔗 File URL: ${uploadResult.file?.permalink}`);

      // Clean up
      fs.unlinkSync(filePath);
      console.log('🧹 Cleaned up local file');
    } else {
      console.log('\n⚠️  Channel not found. Available channels listed above.');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

async function sendPerformanceAlert() {
  try {
    console.log('🎯 Starting daily performance alert...\n');

    const data = await fetchPerformanceData();
    const imagePath = await generateTableImage(data);
    await uploadToSlack(imagePath);

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

console.log('Script starting...');
sendPerformanceAlert()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
