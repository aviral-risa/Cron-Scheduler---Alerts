import 'dotenv/config';
import path from 'path';
import { getLatestPersonQueueSnapshots } from '../services/sheets';
import { ORGANIZATIONS, type Organization } from '../config/organizations';
import type { PersonQueueSnapshot } from '../types/queue';
import { generateImageFromHTML } from './utils/image-generator';
import { uploadImageToSlack } from './utils/slack-uploader';
import { SlackConfig } from './config/slack.config';

interface QueueSummary {
  orgName: string;
  totalOpenOrders: number;
  newOrders: number;
  pendingOrders: number;
  queryOrders: number;
  holdOrders: number;
  authRequiredOrders: number;
  peopleWithOrders: number;
  lastUpdated: string | null;
  providers: Array<{
    name: string;
    totalOrders: number;
    new: number;
    pending: number;
    query: number;
    hold: number;
    authRequired: number;
  }>;
}

/**
 * Fetch queue summary for a specific organization
 */
async function getQueueSummary(org: Organization): Promise<QueueSummary> {
  try {
    // Fetch latest queue snapshots from sheets
    const snapshots = await getLatestPersonQueueSnapshots([org.facilityId]);

    if (snapshots.length === 0) {
      return {
        orgName: org.name,
        totalOpenOrders: 0,
        newOrders: 0,
        pendingOrders: 0,
        queryOrders: 0,
        holdOrders: 0,
        authRequiredOrders: 0,
        peopleWithOrders: 0,
        lastUpdated: null,
        providers: [],
      };
    }

    // Find most recent timestamp
    const lastUpdated = snapshots.reduce((latest, snapshot) => {
      return !latest || snapshot.snapshot_timestamp > latest
        ? snapshot.snapshot_timestamp
        : latest;
    }, '');

    // Calculate totals and build provider list (sorted alphabetically)
    const providersWithOrders = snapshots
      .filter((s) => s.total_open_orders > 0)
      .map((s) => ({
        name: s.person_name,
        totalOrders: s.total_open_orders,
        new: s.new,
        pending: s.pending,
        query: s.query,
        hold: s.hold,
        authRequired: s.auth_required,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const summary = snapshots.reduce(
      (acc, snapshot) => ({
        ...acc,
        totalOpenOrders: acc.totalOpenOrders + snapshot.total_open_orders,
        newOrders: acc.newOrders + snapshot.new,
        pendingOrders: acc.pendingOrders + snapshot.pending,
        queryOrders: acc.queryOrders + snapshot.query,
        holdOrders: acc.holdOrders + snapshot.hold,
        authRequiredOrders: acc.authRequiredOrders + snapshot.auth_required,
        peopleWithOrders: acc.peopleWithOrders + (snapshot.total_open_orders > 0 ? 1 : 0),
      }),
      {
        orgName: org.name,
        totalOpenOrders: 0,
        newOrders: 0,
        pendingOrders: 0,
        queryOrders: 0,
        holdOrders: 0,
        authRequiredOrders: 0,
        peopleWithOrders: 0,
        lastUpdated: lastUpdated || null,
        providers: providersWithOrders,
      } as QueueSummary
    );

    return summary;
  } catch (error) {
    console.error(`Error fetching queue summary for facility ${org.facilityId}:`, error);
    throw error;
  }
}

/**
 * Generate HTML for queue view alert
 */
function generateQueueHTML(summary: QueueSummary): string {
  const lastUpdatedText = summary.lastUpdated
    ? new Date(summary.lastUpdated).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';

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
          padding: 32px 32px 20px 32px;
          background: white;
        }
        .container {
          max-width: 900px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        h1 {
          font-size: 24px;
          color: #1e293b;
          font-weight: 600;
        }
        .emoji {
          font-size: 28px;
        }
        .breakdown {
          margin-bottom: 24px;
        }
        .breakdown-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }
        .breakdown-item {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
        }
        .breakdown-label {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          margin-bottom: 8px;
        }
        .breakdown-value {
          font-size: 32px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        th {
          background: #f8fafc;
          color: #475569;
          font-weight: 600;
          font-size: 12px;
          text-align: left;
          padding: 12px;
          border-bottom: 2px solid #e2e8f0;
        }
        td {
          padding: 10px 12px;
          font-size: 13px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .provider-name {
          font-weight: 600;
          color: #0f172a;
        }
        .total-col {
          font-weight: 700;
          color: #1e40af;
        }
        .footer {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
        }
        .no-orders {
          text-align: center;
          padding: 40px;
          color: #64748b;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="emoji">📋</span>
          <h1>${summary.orgName} - Open Orders Queue Status</h1>
        </div>

        <div class="breakdown">
          <div class="breakdown-grid">
            <div class="breakdown-item">
              <div class="breakdown-label">Total New</div>
              <div class="breakdown-value">${summary.newOrders.toLocaleString()}</div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-label">Total Pending</div>
              <div class="breakdown-value">${summary.pendingOrders.toLocaleString()}</div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-label">Total Query</div>
              <div class="breakdown-value">${summary.queryOrders.toLocaleString()}</div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-label">Total Hold</div>
              <div class="breakdown-value">${summary.holdOrders.toLocaleString()}</div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-label">Auth Required</div>
              <div class="breakdown-value">${summary.authRequiredOrders.toLocaleString()}</div>
            </div>
          </div>
        </div>

        ${
          summary.providers.length > 0
            ? `
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th style="text-align: center;">New</th>
              <th style="text-align: center;">Pending</th>
              <th style="text-align: center;">Query</th>
              <th style="text-align: center;">Hold</th>
              <th style="text-align: center;">Auth Req</th>
              <th style="text-align: center;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${summary.providers
              .slice(0, 15)
              .map(
                (p) => `
              <tr>
                <td class="provider-name">${p.name}</td>
                <td style="text-align: center;">${p.new}</td>
                <td style="text-align: center;">${p.pending}</td>
                <td style="text-align: center;">${p.query}</td>
                <td style="text-align: center;">${p.hold}</td>
                <td style="text-align: center;">${p.authRequired}</td>
                <td class="total-col" style="text-align: center;">${p.totalOrders}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
              <td class="provider-name">Total</td>
              <td style="text-align: center;">${summary.newOrders}</td>
              <td style="text-align: center;">${summary.pendingOrders}</td>
              <td style="text-align: center;">${summary.queryOrders}</td>
              <td style="text-align: center;">${summary.holdOrders}</td>
              <td style="text-align: center;">${summary.authRequiredOrders}</td>
              <td class="total-col" style="text-align: center;">${summary.totalOpenOrders}</td>
            </tr>
          </tfoot>
        </table>
        `
            : `
        <div class="no-orders">✅ No open orders in queue</div>
        `
        }

        <div class="footer">
          Last updated: ${lastUpdatedText} IST • Generated at ${new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  })} IST
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send queue alert for a specific organization
 */
async function sendQueueAlertForOrg(org: Organization): Promise<void> {
  try {
    console.log(`\n📤 Processing queue alert for ${org.name}...`);

    // Fetch queue summary
    const summary = await getQueueSummary(org);

    // Generate HTML
    const html = generateQueueHTML(summary);

    // Generate image
    const imagePath = path.join(process.cwd(), `queue-${summary.orgName.toLowerCase()}.png`);
    await generateImageFromHTML(html, {
      outputPath: imagePath,
      width: 900,
      height: 600,
    });

    // Upload to Slack
    await uploadImageToSlack({
      imagePath,
      channel: org.id,
      title: `📋 ${org.name} - Queue Status`,
      comment: `*Queue Status Report for ${org.name}*\nTotal Open Orders: *${summary.totalOpenOrders}* | Active People: *${summary.peopleWithOrders}*`,
      useOrgChannel: true,
      cleanup: true,
    });

    console.log(`✓ Successfully processed queue alert for ${org.name}`);
    console.log(`  Total open orders: ${summary.totalOpenOrders}`);
    console.log(`  People with orders: ${summary.peopleWithOrders}`);
  } catch (error) {
    console.error(`❌ Error sending queue alert for ${org.name}:`, error);
    throw error;
  }
}

/**
 * Send queue alerts for all organizations
 */
export async function sendQueueAlertsForAll(): Promise<void> {
  console.log('🚀 Starting queue view alerts for all organizations...');

  const results = await Promise.allSettled(
    ORGANIZATIONS.map((org) => sendQueueAlertForOrg(org))
  );

  // Summary
  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Queue Alerts Summary:');
  console.log(`   ✓ Successful: ${successful}/${ORGANIZATIONS.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${ORGANIZATIONS.length}`);
  }

  // Log failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`   Failed for ${ORGANIZATIONS[index].name}:`, result.reason);
    }
  });
}

/**
 * Preview mode - generate image without sending to Slack
 */
async function previewQueueAlert(org: Organization): Promise<void> {
  console.log(`\n🔍 Previewing queue alert for ${org.name}...`);

  const summary = await getQueueSummary(org);
  const html = generateQueueHTML(summary);
  const imagePath = path.join(process.cwd(), `queue-${summary.orgName.toLowerCase()}.png`);

  await generateImageFromHTML(html, {
    outputPath: imagePath,
    width: 900,
    height: 600,
  });

  console.log('\n📊 Summary:');
  console.log(`  Total Open Orders: ${summary.totalOpenOrders}`);
  console.log(`  People with Orders: ${summary.peopleWithOrders}`);
  console.log(`  - New: ${summary.newOrders}`);
  console.log(`  - Pending: ${summary.pendingOrders}`);
  console.log(`  - Query: ${summary.queryOrders}`);
  console.log(`  - Hold: ${summary.holdOrders}`);
  console.log(`  - Auth Required: ${summary.authRequiredOrders}`);
  console.log(`\n📁 Preview image saved at: ${imagePath}`);
}

// Main execution
async function main() {
  const command = process.argv[2];
  const orgArg = process.argv[3];

  try {
    if (command === 'preview') {
      // Preview mode
      if (orgArg) {
        const org = ORGANIZATIONS.find((o) => o.id === orgArg.toLowerCase());
        if (!org) {
          console.error(
            `Error: Unknown organization '${orgArg}'. Valid options: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`
          );
          process.exit(1);
        }
        await previewQueueAlert(org);
      } else {
        // Preview for all orgs
        for (const org of ORGANIZATIONS) {
          await previewQueueAlert(org);
        }
      }
    } else if (command === 'send') {
      // Send mode
      if (orgArg) {
        const org = ORGANIZATIONS.find((o) => o.id === orgArg.toLowerCase());
        if (!org) {
          console.error(
            `Error: Unknown organization '${orgArg}'. Valid options: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`
          );
          process.exit(1);
        }
        await sendQueueAlertForOrg(org);
      } else {
        await sendQueueAlertsForAll();
      }
    } else {
      console.log('Usage:');
      console.log('  npx tsx src/alerts/queue-view-alert.ts preview [org]    - Preview alert image');
      console.log('  npx tsx src/alerts/queue-view-alert.ts send [org]       - Send alert to Slack');
      console.log('');
      console.log('Examples:');
      console.log('  npm run alert:queue preview          - Preview all orgs');
      console.log('  npm run alert:queue preview nycbs    - Preview NYCBS only');
      console.log('  npm run alert:queue send             - Send to all orgs');
      console.log('  npm run alert:queue send chc         - Send to CHC only');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { sendQueueAlertForOrg, previewQueueAlert };
