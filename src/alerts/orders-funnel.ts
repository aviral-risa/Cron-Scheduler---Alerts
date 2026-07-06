import puppeteer from 'puppeteer';
import { WebClient } from '@slack/web-api';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const IMAGE_PATH = path.join(process.cwd(), 'orders-funnel.png');

interface OrdersFunnelData {
  date: string;
  ordersLoaded: number;
  ordersAssigned: number;
  assignedPercent: number;
  ordersCompleted: number;
  completedAssignedPercent: number;
  completedTodayPercent: number;
  inProgressTodayPercent: number;
  isAverage?: boolean;
}

async function fetchOrdersFunnelData(): Promise<OrdersFunnelData[]> {
  // TODO: Replace with actual data from your source
  return [
    {
      date: 'Sun, Jan 11',
      ordersLoaded: 3265,
      ordersAssigned: 611,
      assignedPercent: 18.7,
      ordersCompleted: 559,
      completedAssignedPercent: 91.5,
      completedTodayPercent: 17.1,
      inProgressTodayPercent: 1.6
    },
    {
      date: 'Fri, Jan 9',
      ordersLoaded: 3159,
      ordersAssigned: 1878,
      assignedPercent: 59.4,
      ordersCompleted: 1670,
      completedAssignedPercent: 88.9,
      completedTodayPercent: 52.9,
      inProgressTodayPercent: 6.6
    },
    {
      date: 'Thu, Jan 8',
      ordersLoaded: 3192,
      ordersAssigned: 1780,
      assignedPercent: 55.8,
      ordersCompleted: 1615,
      completedAssignedPercent: 90.7,
      completedTodayPercent: 50.6,
      inProgressTodayPercent: 5.2
    },
    {
      date: 'Wed, Jan 7',
      ordersLoaded: 4191,
      ordersAssigned: 2245,
      assignedPercent: 53.6,
      ordersCompleted: 1816,
      completedAssignedPercent: 80.9,
      completedTodayPercent: 43.3,
      inProgressTodayPercent: 10.2
    },
    {
      date: 'Tue, Jan 6',
      ordersLoaded: 2293,
      ordersAssigned: 1674,
      assignedPercent: 73,
      ordersCompleted: 1450,
      completedAssignedPercent: 86.6,
      completedTodayPercent: 63.2,
      inProgressTodayPercent: 9.8
    },
    {
      date: 'Mon, Jan 5',
      ordersLoaded: 2936,
      ordersAssigned: 2056,
      assignedPercent: 70,
      ordersCompleted: 1697,
      completedAssignedPercent: 82.5,
      completedTodayPercent: 57.8,
      inProgressTodayPercent: 12.2
    },
    {
      date: 'L7D Avg',
      ordersLoaded: 3173,
      ordersAssigned: 1707,
      assignedPercent: 53.8,
      ordersCompleted: 1468,
      completedAssignedPercent: 86,
      completedTodayPercent: 46.3,
      inProgressTodayPercent: 7.5,
      isAverage: true
    },
    {
      date: 'L30D Avg',
      ordersLoaded: 3173,
      ordersAssigned: 1707,
      assignedPercent: 53.8,
      ordersCompleted: 1468,
      completedAssignedPercent: 86,
      completedTodayPercent: 46.3,
      inProgressTodayPercent: 7.5,
      isAverage: true
    }
  ];
}

function generateTableHTML(data: OrdersFunnelData[]): string {
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
          max-width: 1600px;
        }
        h1 {
          font-size: 24px;
          color: #1e293b;
          margin-bottom: 20px;
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
          font-size: 13px;
          text-align: left;
          padding: 14px 12px;
          border-bottom: 2px solid #e2e8f0;
        }
        td {
          padding: 14px 12px;
          font-size: 14px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .avg-row {
          background-color: #fef3c7;
          font-weight: 600;
        }
        .font-bold {
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Orders Funnel</h1>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders Loaded</th>
              <th>Orders Assigned</th>
              <th>% Assigned / Loaded</th>
              <th>Orders Completed</th>
              <th>% Completed / Assigned</th>
              <th>% Completed / Today</th>
              <th>% In-Progress / Today</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr class="${row.isAverage ? 'avg-row' : ''}">
                <td>${row.date}</td>
                <td>${row.ordersLoaded.toLocaleString()}</td>
                <td>${row.ordersAssigned.toLocaleString()}</td>
                <td>${row.assignedPercent}%</td>
                <td class="font-bold">${row.ordersCompleted.toLocaleString()}</td>
                <td>${row.completedAssignedPercent}%</td>
                <td>${row.completedTodayPercent}%</td>
                <td>${row.inProgressTodayPercent}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

async function generateTableImage(data: OrdersFunnelData[]): Promise<string> {
  console.log('🚀 Generating Orders Funnel image...');

  const html = generateTableHTML(data);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 1600, height: 900 });
    await page.evaluate(() => document.fonts.ready);

    // Calculate the actual content height
    const contentHeight = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollHeight + 80 : 900;
    });

    // Set viewport to match content
    await page.setViewport({ width: 1600, height: contentHeight });

    await page.screenshot({
      path: IMAGE_PATH,
      type: 'png',
      fullPage: false
    });

    console.log(`✅ Orders Funnel image generated: ${IMAGE_PATH}`);
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
    filename: 'orders-funnel.png',
    title: '📊 Orders Funnel',
    initial_comment: `*Orders Funnel View*\nGenerated at ${new Date().toLocaleString('en-US', {
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

async function sendOrdersFunnel() {
  try {
    console.log('🎯 Sending Orders Funnel...\n');

    const data = await fetchOrdersFunnelData();
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
sendOrdersFunnel()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

export { sendOrdersFunnel };
