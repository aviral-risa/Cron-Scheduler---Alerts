/**
 * Backfill business_metrics_daily Sheet
 *
 * Backfills business_metrics_daily for the last 14 days by reading
 * unique_orders_status and calculating metrics for each facility × date combination.
 *
 * This script should be run once after deploying the new architecture to populate
 * historical data in the business_metrics_daily sheet.
 *
 * Logic:
 * 1. For each of last 14 days:
 * 2.   For each facility (CHC, NYCBS, MBPCC, UCBC):
 * 3.     Read unique_orders_status for that date + facility
 * 4.     Calculate business metrics (20 columns)
 * 5.     Write to business_metrics_daily sheet (upsert)
 *
 * Usage:
 *   npm run cli backfill-business-metrics [--days=14]
 */

import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { calculateBusinessMetrics } from '../services/sync';
import { appendOrUpdateBusinessMetrics } from '../services/sheets-dual';
import { ORGANIZATIONS } from '../config/organizations';

interface BackfillOptions {
  days?: number; // Number of days to backfill (default: 14)
}

async function backfillBusinessMetrics(options: BackfillOptions = {}) {
  const daysToBackfill = options.days || 14;

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill business_metrics_daily              ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log(`Days to backfill: ${daysToBackfill}`);
  console.log(`Facilities: ${ORGANIZATIONS.map((o) => o.facilityId).join(', ')}\n`);

  // Calculate date range
  const endDate = new Date();
  const startDate = subDays(endDate, daysToBackfill - 1);

  console.log(`Date range: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}\n`);

  try {
    let totalProcessed = 0;
    let totalErrors = 0;

    // Process each date
    for (let i = 0; i < daysToBackfill; i++) {
      const date = subDays(endDate, daysToBackfill - 1 - i);
      const dateStr = format(date, 'yyyy-MM-dd');

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${dateStr} (Day ${i + 1}/${daysToBackfill})`);
      console.log(`${'='.repeat(60)}`);

      // Process each facility for this date
      for (const org of ORGANIZATIONS) {
        try {
          console.log(`\n[${org.facilityId}] Calculating business metrics for ${dateStr}...`);

          // Calculate metrics from unique_orders_status
          const metrics = await calculateBusinessMetrics(dateStr, org.facilityId);

          // Write to business_metrics_daily
          await appendOrUpdateBusinessMetrics([metrics]);

          console.log(
            `✅ [${org.facilityId}] Processed ${metrics.total_orders} orders for ${dateStr}`
          );
          totalProcessed++;
        } catch (error) {
          console.error(`❌ [${org.facilityId}] Error processing ${dateStr}:`, error);
          totalErrors++;
        }
      }
    }

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  BACKFILL SUMMARY                              ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`Total date-facility combinations processed: ${totalProcessed}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Expected rows: ${daysToBackfill} dates × ${ORGANIZATIONS.length} facilities = ${daysToBackfill * ORGANIZATIONS.length}`);
    console.log(`Success rate: ${((totalProcessed / (daysToBackfill * ORGANIZATIONS.length)) * 100).toFixed(1)}%\n`);

    if (totalErrors === 0) {
      console.log('✅ Backfill completed successfully!');
      console.log('   business_metrics_daily sheet is now populated with historical data\n');
      console.log('Next steps:');
      console.log('1. Verify data in business_metrics_daily sheet');
      console.log('2. Update Business View to query business_metrics_daily');
      console.log('3. Make Business View the default route in App.tsx');
    } else {
      console.log(`⚠️  Backfill completed with ${totalErrors} errors`);
      console.log('   Review errors above and retry if needed\n');
    }
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

export { backfillBusinessMetrics };
