/**
 * Recalculate Business Metrics for Single Date - All Orgs
 *
 * IMPORTANT: This script:
 * 1. Fetches fresh order data from Algolia/data source
 * 2. Updates unique_orders_status sheet with latest data
 * 3. Recalculates business metrics from the updated data
 * 4. Writes metrics to business_metrics_daily sheet
 */

import 'dotenv/config';
import { format } from 'date-fns';
import { calculateBusinessMetrics, syncUniqueOrdersStatus } from '../services/sync';
import { appendOrUpdateBusinessMetrics } from '../services/sheets-dual';
import { fetchOrdersByDate } from '../services/data-source';
import { ORGANIZATIONS } from '../config/organizations';
import { SlackConfig } from '../alerts/config/slack.config';
import { WebClient } from '@slack/web-api';

export async function recalculateSingleDate() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Recalculate Single Date - All Orgs          ║');
  console.log('║  (Fetch from Algolia + Update + Recalculate) ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Get date from command line args or use today
  const args = process.argv.slice(3);
  const testDate = args[0] || format(new Date(), 'yyyy-MM-dd');

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    console.error('❌ Error: Date must be in YYYY-MM-DD format');
    console.error('Usage: npm run cli recalculate-today [YYYY-MM-DD]');
    process.exit(1);
  }

  console.log(`Date: ${testDate}`);
  console.log(`Organizations: ${ORGANIZATIONS.length}\n`);

  const allMetrics = [];
  const date = new Date(testDate);

  for (const org of ORGANIZATIONS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing ${org.name} (${org.facilityId})`);
    console.log('='.repeat(60));

    try {
      // Step 1: Fetch fresh data from Algolia
      console.log(`\n[${org.name}] Step 1: Fetching orders from Algolia...`);
      const { algoliaOrders } = await fetchOrdersByDate(date, org.facilityId);

      if (!algoliaOrders || algoliaOrders.length === 0) {
        console.log(`  ⚠️  No orders found for ${org.name} on ${testDate}`);
        continue;
      }

      console.log(`  ✅ Fetched ${algoliaOrders.length} orders from Algolia`);

      // Step 2: Update unique_orders_status sheet with fresh data
      console.log(`\n[${org.name}] Step 2: Updating unique_orders_status sheet...`);
      const uniqueStatus = await syncUniqueOrdersStatus(algoliaOrders, org.facilityId, org.name);
      console.log(`  ✅ Updated sheet: ${uniqueStatus.inserted} new, ${uniqueStatus.updated} updated, ${uniqueStatus.unchanged} unchanged`);

      // Step 3: Recalculate business metrics from updated data
      console.log(`\n[${org.name}] Step 3: Calculating business metrics...`);
      const metrics = await calculateBusinessMetrics(testDate, org.facilityId);

      console.log(`  Total Orders: ${metrics.total_orders}`);
      console.log(`  Orders Completed: ${metrics.orders_completed}`);
      console.log(`  Orders In Progress: ${metrics.orders_inprogress}`);
      console.log(`  Total Billable Orders: ${metrics.total_billable_orders}`);
      console.log(`  Completion %: ${metrics.order_completion_pct.toFixed(1)}%`);

      allMetrics.push(metrics);
    } catch (error) {
      console.error(`  ❌ Error processing ${org.name}:`, error);
    }
  }

  // Step 4: Write all metrics to business_metrics_daily sheet
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\nWriting ${allMetrics.length} org metrics to business_metrics_daily sheet...`);
  await appendOrUpdateBusinessMetrics(allMetrics);

  // Send Slack notification with summary
  try {
    const botToken = SlackConfig.getBotToken();
    const channelId = SlackConfig.getDefaultChannelId();
    const web = new WebClient(botToken);

    const orgLines = allMetrics.map((m: any) => {
      const org = ORGANIZATIONS.find(o => o.facilityId === m.facility_id);
      return `• *${org?.name ?? m.facility_id}*: ${m.total_orders} orders | ${m.orders_completed} completed | ${m.total_billable_orders} billable (${m.order_completion_pct.toFixed(1)}%)`;
    });

    const skippedOrgs = ORGANIZATIONS.filter(
      o => !allMetrics.some((m: any) => m.facility_id === o.facilityId)
    );
    const skippedLines = skippedOrgs.map(o => `• ${o.name}: No orders found`);

    const message = [
      `✅ *Dashboard Data Refreshed* — ${testDate}`,
      ``,
      `*${allMetrics.length}/${ORGANIZATIONS.length} orgs recalculated:*`,
      ...orgLines,
      ...(skippedLines.length > 0 ? [``, `*Skipped (no data):*`, ...skippedLines] : []),
    ].join('\n');

    await web.chat.postMessage({ channel: channelId, text: message });
    console.log('\n📢 Slack notification sent');
  } catch (error) {
    console.error('\n⚠️  Failed to send Slack notification:', error);
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  SUCCESS                                       ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`✅ Recalculated business metrics for ${allMetrics.length} organizations`);
  console.log(`\nDate: ${testDate}`);
  console.log(`Organizations: ${ORGANIZATIONS.map(o => o.name).join(', ')}\n`);
}
