/**
 * Backfill BO Count for Date Range
 *
 * Fetches bo_count from Firestore for multiple dates and populates
 * the unique_orders_status sheet for all organizations.
 *
 * Usage:
 *   npm run cli backfill-bo-count-range [--days <number>]
 *
 * Examples:
 *   npm run cli backfill-bo-count-range              # Last 14 days (default)
 *   npm run cli backfill-bo-count-range --days 30    # Last 30 days
 */

import 'dotenv/config';
import { subDays, format } from 'date-fns';
import { fetchAndStoreBoCountForMissingOrders } from '../services/bo-count-fetch.service';
import { ORGANIZATIONS } from '../config/organizations';

interface DayResult {
  date: string;
  totalUpdated: number;
  orgResults: {
    orgName: string;
    updated: number;
    withBoCountGt1: number;
    maxBoCount: number;
  }[];
}

export async function backfillBoCountRange() {
  const args = process.argv.slice(3);

  // Parse --days flag
  const daysFlag = args.indexOf('--days');
  const days = daysFlag !== -1 && args[daysFlag + 1] ? parseInt(args[daysFlag + 1]) : 14;

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill BO Count - Date Range               ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log(`📅 Date Range: Last ${days} days`);
  console.log(`🏢 Organizations: ${ORGANIZATIONS.length} (${ORGANIZATIONS.map(o => o.name).join(', ')})\n`);

  try {
    const results: DayResult[] = [];
    let grandTotalUpdated = 0;

    // Generate date range (last N days including today)
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      dates.push(format(date, 'yyyy-MM-dd'));
    }

    console.log(`Processing ${dates.length} dates...\n`);
    console.log('═'.repeat(60));

    // Process each date
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dayNum = i + 1;

      console.log(`\n📆 Day ${dayNum}/${dates.length}: ${date}`);
      console.log('─'.repeat(60));

      const dayResult: DayResult = {
        date,
        totalUpdated: 0,
        orgResults: [],
      };

      // Process each organization for this date
      for (const org of ORGANIZATIONS) {
        process.stdout.write(`   ${org.name.padEnd(15)} ... `);

        try {
          const updated = await fetchAndStoreBoCountForMissingOrders(date, org.facilityId);
          dayResult.totalUpdated += updated;
          grandTotalUpdated += updated;

          // For summary, we'd need to track the stats, but let's keep it simple
          dayResult.orgResults.push({
            orgName: org.name,
            updated,
            withBoCountGt1: 0, // Would need to track this separately
            maxBoCount: 0,
          });

          if (updated > 0) {
            console.log(`✅ ${updated} orders`);
          } else {
            console.log(`✓ (already populated)`);
          }
        } catch (error: any) {
          console.log(`❌ Error: ${error.message}`);
          dayResult.orgResults.push({
            orgName: org.name,
            updated: 0,
            withBoCountGt1: 0,
            maxBoCount: 0,
          });
        }
      }

      results.push(dayResult);

      // Show day summary
      console.log(`   └─ Day Total: ${dayResult.totalUpdated} orders updated`);
    }

    // Final Summary
    console.log('\n' + '═'.repeat(60));
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  BACKFILL COMPLETE                             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📊 Summary by Date:');
    console.log('─'.repeat(60));
    results.forEach((result) => {
      const bar = '█'.repeat(Math.min(50, Math.floor(result.totalUpdated / 100)));
      console.log(`${result.date}  ${result.totalUpdated.toString().padStart(5)} orders  ${bar}`);
    });

    console.log('\n📊 Summary by Organization:');
    console.log('─'.repeat(60));
    const orgTotals = new Map<string, number>();
    results.forEach((result) => {
      result.orgResults.forEach((orgResult) => {
        const current = orgTotals.get(orgResult.orgName) || 0;
        orgTotals.set(orgResult.orgName, current + orgResult.updated);
      });
    });

    orgTotals.forEach((total, orgName) => {
      const bar = '█'.repeat(Math.min(50, Math.floor(total / 100)));
      console.log(`${orgName.padEnd(15)}  ${total.toString().padStart(5)} orders  ${bar}`);
    });

    console.log('\n📈 Overall Statistics:');
    console.log('─'.repeat(60));
    console.log(`   Date Range: ${dates[dates.length - 1]} to ${dates[0]}`);
    console.log(`   Total Days: ${dates.length}`);
    console.log(`   Organizations: ${ORGANIZATIONS.length}`);
    console.log(`   Total Orders Updated: ${grandTotalUpdated.toLocaleString()}`);
    console.log(`   Average per Day: ${Math.round(grandTotalUpdated / dates.length).toLocaleString()}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
