/**
 * Backfill payer_treatment_aging Sheet
 *
 * Reads all orders via getExistingOrderStatusMap(), runs calculatePayerTreatmentAging()
 * over the date range, and writes results via appendOrUpdatePayerTreatmentAging().
 *
 * Usage:
 *   npm run cli payer-aging-backfill [--days=30]
 */

import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { getExistingOrderStatusMap, appendOrUpdatePayerTreatmentAging } from '../services/sheets-dual';
import { calculatePayerTreatmentAging } from '../utils/metrics/payerTreatmentAging';

interface BackfillOptions {
  days?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

async function backfillPayerTreatmentAging(options: BackfillOptions = {}) {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill payer_treatment_aging                ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  let startDateStr: string;
  let endDateStr: string;

  if (options.startDate && options.endDate) {
    startDateStr = options.startDate;
    endDateStr = options.endDate;
  } else {
    const daysToBackfill = options.days || 30;
    console.log(`Days to backfill: ${daysToBackfill}\n`);
    const endDate = new Date();
    const startDate = subDays(endDate, daysToBackfill - 1);
    startDateStr = format(startDate, 'yyyy-MM-dd');
    endDateStr = format(endDate, 'yyyy-MM-dd');
  }

  console.log(`Date range: ${startDateStr} to ${endDateStr}\n`);

  try {
    // Read all orders from unique_orders_status
    console.log('Reading all orders from unique_orders_status...');
    const orderMap = await getExistingOrderStatusMap();
    const allOrders = Array.from(orderMap.values());
    console.log(`Total orders in sheet: ${allOrders.length}\n`);

    // Calculate payer treatment aging
    console.log('Calculating payer treatment aging metrics...');
    const rows = calculatePayerTreatmentAging(allOrders, startDateStr, endDateStr);
    console.log(`Calculated ${rows.length} payer aging rows\n`);

    if (rows.length === 0) {
      console.log('No rows to write. Check date range and order data.');
      return;
    }

    // Write to sheet
    console.log('Writing to payer_treatment_aging sheet...');
    await appendOrUpdatePayerTreatmentAging(rows);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  BACKFILL SUMMARY                              ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`Total rows written: ${rows.length}`);
    console.log(`Date range: ${startDateStr} to ${endDateStr}`);
    console.log(`\n✅ Backfill completed successfully!\n`);
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

export { backfillPayerTreatmentAging };
