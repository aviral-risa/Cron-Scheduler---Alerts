import { IncomingWebhook } from '@slack/webhook';

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  throw new Error('SLACK_WEBHOOK_URL environment variable is required');
}

interface PerformanceData {
  date: string;
  ordersWorked: number;
  ordersLoaded: number;
  sevenDayAvg: number;
  variance: number;
  variancePercent: number;
  activePeople: number;
  ordersPerPerson: number;
  status: 'above' | 'normal' | 'below';
}

/**
 * Fetch the last 5 business days of performance data
 * TODO: Integrate with your actual data source (Firebase, Sheets, etc.)
 */
async function fetchPerformanceData(): Promise<PerformanceData[]> {
  // TODO: Replace this with actual data fetching logic
  // This is placeholder data - you'll need to integrate with your actual data source

  // Example: Fetch from Firebase, Google Sheets, or your API
  // const data = await fetchFromFirebase();
  // const data = await fetchFromGoogleSheets();

  // For now, returning sample data
  return [
    {
      date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      ordersWorked: 0,
      ordersLoaded: 0,
      sevenDayAvg: 0,
      variance: 0,
      variancePercent: 0,
      activePeople: 0,
      ordersPerPerson: 0,
      status: 'normal'
    }
  ];
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'above': return '🟢';
    case 'normal': return '⚪';
    case 'below': return '🔴';
    default: return '⚪';
  }
}

export async function sendDailyPerformanceAlert() {
  try {
    // Fetch the latest performance data
    const performanceData = await fetchPerformanceData();

    if (!performanceData || performanceData.length === 0) {
      console.log('⚠️  No performance data available to send');
      return;
    }

    const webhook = new IncomingWebhook(WEBHOOK_URL);

    // Create a formatted table using Slack Block Kit
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Performance Breakdown',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Last 5 Business Days Performance Report*\n_Generated: ${new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'full',
            timeStyle: 'short'
          })}_`
        }
      },
      {
        type: 'divider'
      }
    ];

    // Add each day's performance as a section
    performanceData.forEach((day) => {
      const statusEmoji = getStatusEmoji(day.status);
      const varianceSign = day.variance >= 0 ? '+' : '';
      const varianceColor = day.variance > 0 ? '🟢' : day.variance < 0 ? '🔴' : '⚪';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${day.date}*\n` +
                `📦 Orders Worked: *${formatNumber(day.ordersWorked)}*\n` +
                `📥 Orders Loaded: ${formatNumber(day.ordersLoaded)}\n` +
                `📈 7-Day Avg: ${formatNumber(day.sevenDayAvg)}\n` +
                `${varianceColor} Variance: ${varianceSign}${formatNumber(day.variance)} (${varianceSign}${day.variancePercent}%)\n` +
                `👥 Active People: ${day.activePeople}\n` +
                `⚡ Orders/Person: ${day.ordersPerPerson}`
        }
      });
    });

    // Add summary section
    const totalOrders = performanceData.reduce((sum, day) => sum + day.ordersWorked, 0);
    const avgOrdersPerDay = Math.round(totalOrders / performanceData.length);

    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 ${performanceData.length}-Day Summary*\n` +
                `Total Orders Worked: *${formatNumber(totalOrders)}*\n` +
                `Average Per Day: *${formatNumber(avgOrdersPerDay)}*`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '🟢 Above avg (>+5%) | ⚪ Normal (±5%) | 🔴 Below avg (<-5%)'
          }
        ]
      }
    );

    const response = await webhook.send({
      blocks: blocks,
      text: 'Daily Performance Breakdown'
    });

    console.log('✅ Daily performance alert sent successfully!');
    return response;
  } catch (error) {
    console.error('❌ Error sending daily performance alert:', error);
    throw error;
  }
}

// If running this file directly, execute the function
if (import.meta.url === `file://${process.argv[1]}`) {
  sendDailyPerformanceAlert()
    .then(() => {
      console.log('✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}
