/**
 * Test Backfill - Single Day, Single Org
 *
 * Backfills business metrics for 1 day and 1 org for testing
 */

import 'dotenv/config';
import { format } from 'date-fns';
import { calculateBusinessMetrics } from '../services/sync';
import { appendOrUpdateBusinessMetrics } from '../services/sheets-dual';

export async function testBackfillSingle() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Test Backfill - Single Day, Single Org       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Test with today and NYCBS (HhwIHO4npKhrxyylkC33)
  const testDate = format(new Date(), 'yyyy-MM-dd');
  const testOrg = 'HhwIHO4npKhrxyylkC33'; // NYCBS facility ID

  console.log(`Test Date: ${testDate}`);
  console.log(`Test Org: ${testOrg}\n`);

  try {
    console.log(`Calculating business metrics for ${testOrg} on ${testDate}...`);

    // Calculate metrics from unique_orders_status
    const metrics = await calculateBusinessMetrics(testDate, testOrg);

    console.log(`\nMetrics calculated:`);
    console.log(`  Total Orders: ${metrics.total_orders}`);
    console.log(`  Orders Assigned: ${metrics.orders_assigned}`);
    console.log(`  Orders Completed: ${metrics.orders_completed}`);
    console.log(`  Orders In Progress: ${metrics.orders_inprogress}`);
    console.log(`  Order Completion %: ${metrics.order_completion_pct.toFixed(1)}%`);
    console.log(`  Order In Progress %: ${metrics.order_inprogress_pct.toFixed(1)}%`);
    console.log(`  Approval Rate: ${metrics.approval_rate_pct.toFixed(1)}%`);
    console.log(`  Authorization Rate: ${metrics.authorization_rate_pct.toFixed(1)}%`);

    // Write to business_metrics_daily
    console.log(`\nWriting to business_metrics_daily sheet...`);
    await appendOrUpdateBusinessMetrics([metrics]);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  SUCCESS                                       ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`✅ Test backfill completed successfully`);
    console.log(`\nPlease check the business_metrics_daily sheet:`);
    console.log(`https://docs.google.com/spreadsheets/d/19mRsj9X2tXJb8t1zqinHysQbzlndyeKpxgdL5gaQqbc`);
    console.log(`\nLook for row: ${testDate} | ${testOrg}`);
    console.log(`Total orders should be: ${metrics.total_orders}\n`);

  } catch (error) {
    console.error('❌ Error during test backfill:', error);
    throw error;
  }
}
