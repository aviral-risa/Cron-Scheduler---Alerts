/**
 * Recalculate Business Metrics for Date Range - All Orgs
 *
 * IMPORTANT: This script:
 * 1. Fetches fresh order data from Algolia/data source for each date
 * 2. Updates unique_orders_status sheet with latest data
 * 3. Recalculates business metrics from the updated data
 * 4. Writes metrics to business_metrics_daily sheet
 */

import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { calculateBusinessMetrics, syncUniqueOrdersStatus } from '../services/sync';
import { appendOrUpdateBusinessMetrics } from '../services/sheets-dual';
import { fetchOrdersByDate } from '../services/data-source';
import { ORGANIZATIONS } from '../config/organizations';

export async function recalculateDateRange() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Recalculate Date Range - All Orgs           ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Get date range from command line args
  const args = process.argv.slice(3);
  const startDateArg = args[0];
  const endDateArg = args[1] || format(new Date(), 'yyyy-MM-dd');

  // Validate date format
  if (!startDateArg || !/^\d{4}-\d{2}-\d{2}$/.test(startDateArg)) {
    console.error('❌ Error: Start date must be in YYYY-MM-DD format');
    console.error('Usage: npm run cli recalculate-date-range [START_DATE] [END_DATE]');
    console.error('Example: npm run cli recalculate-date-range 2026-01-21 2026-02-03');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateArg)) {
    console.error('❌ Error: End date must be in YYYY-MM-DD format');
    process.exit(1);
  }

  const startDate = new Date(startDateArg);
  const endDate = new Date(endDateArg);

  if (startDate > endDate) {
    console.error('❌ Error: Start date must be before or equal to end date');
    process.exit(1);
  }

  // Generate date array
  const dates: string[] = [];
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(format(currentDate, 'yyyy-MM-dd'));
    currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
  }

  console.log(`Start Date: ${startDateArg}`);
  console.log(`End Date: ${endDateArg}`);
  console.log(`Total Days: ${dates.length}`);
  console.log(`Organizations: ${ORGANIZATIONS.length}\n`);

  let totalMetricsCalculated = 0;
  let totalErrors = 0;

  console.log('══════════════════════════════════════════════════════════════════════\n');

  for (const date of dates) {
    console.log(`📅 ${date}`);
    console.log('──────────────────────────────────────────────────────────────────────');

    const allMetrics = [];
    const dateObj = new Date(date);

    for (const org of ORGANIZATIONS) {
      try {
        // Step 1: Fetch fresh data from Algolia
        const { algoliaOrders } = await fetchOrdersByDate(dateObj, org.facilityId);

        if (!algoliaOrders || algoliaOrders.length === 0) {
          console.log(`   ${org.name}: No orders found`);
          continue;
        }

        // Step 2: Update unique_orders_status sheet with fresh data
        const uniqueStatus = await syncUniqueOrdersStatus(algoliaOrders, org.facilityId, org.name);

        // Step 3: Recalculate business metrics from updated data
        const metrics = await calculateBusinessMetrics(date, org.facilityId);

        console.log(`   ${org.name}: ${metrics.total_billable_orders} billable (${metrics.orders_completed} completed + ${metrics.orders_inprogress} in progress) | Updated: ${uniqueStatus.inserted} new, ${uniqueStatus.updated} changed`);

        allMetrics.push(metrics);
      } catch (error) {
        console.error(`   ❌ Error processing ${org.name}:`, error);
        totalErrors++;
      }
    }

    if (allMetrics.length > 0) {
      await appendOrUpdateBusinessMetrics(allMetrics);
      totalMetricsCalculated += allMetrics.length;
      console.log(`   ✅ Updated ${allMetrics.length} org metrics\n`);
    }
  }

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  RECALCULATION COMPLETE                        ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('📊 Summary:');
  console.log(`   Total Days Processed: ${dates.length}`);
  console.log(`   Total Metrics Calculated: ${totalMetricsCalculated}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Date Range: ${startDateArg} to ${endDateArg}\n`);
}
