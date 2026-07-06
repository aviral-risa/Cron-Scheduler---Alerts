/**
 * Recalculate business_metrics_daily from unique_orders_status for a date range.
 * No Algolia fetch — reads directly from the sheet.
 *
 * Usage: npx tsx src/scripts/recalculate-business-metrics-range.ts 2026-01-01 2026-02-06
 */

import 'dotenv/config';
import { calculateBusinessMetrics } from '../services/sync';
import { appendOrUpdateBusinessMetrics } from '../services/sheets-dual';
import { ORGANIZATIONS } from '../config/organizations';

async function main() {
  const startDateArg = process.argv[2];
  const endDateArg = process.argv[3];

  if (!startDateArg || !endDateArg || !/^\d{4}-\d{2}-\d{2}$/.test(startDateArg) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateArg)) {
    console.error('Usage: npx tsx src/scripts/recalculate-business-metrics-range.ts YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
  }

  // Generate dates
  const dates: string[] = [];
  const current = new Date(startDateArg);
  const end = new Date(endDateArg);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  console.log(`\nRecalculating business metrics from unique_orders_status`);
  console.log(`Date range: ${startDateArg} to ${endDateArg} (${dates.length} days)`);
  console.log(`Organizations: ${ORGANIZATIONS.map(o => o.name).join(', ')}\n`);

  let total = 0;

  for (const date of dates) {
    const metrics = [];

    for (const org of ORGANIZATIONS) {
      const m = await calculateBusinessMetrics(date, org.facilityId);
      if (m.total_orders > 0) {
        metrics.push(m);
        console.log(`  ${date} | ${org.name}: ${m.total_orders} total, ${m.orders_completed} completed, ${m.total_billable_orders} billable`);
      }
    }

    if (metrics.length > 0) {
      await appendOrUpdateBusinessMetrics(metrics);
      total += metrics.length;
    }
  }

  console.log(`\nDone. Updated ${total} rows in business_metrics_daily.`);
}

main().catch(console.error);
