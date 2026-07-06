/**
 * Backfill BO Count for Orders
 *
 * Fetches bo_count from Firestore and populates the unique_orders_status sheet
 * for orders that are missing this value.
 *
 * Usage:
 *   npm run cli backfill-bo-count <date> [--org <facility_id>]
 *
 * Examples:
 *   npm run cli backfill-bo-count 2026-02-03
 *   npm run cli backfill-bo-count 2026-02-03 --org nycbs
 */

import 'dotenv/config';
import { fetchAndStoreBoCountForMissingOrders } from '../services/bo-count-fetch.service';
import { ORGANIZATIONS } from '../config/organizations';

export async function backfillBoCount() {
  // When called via CLI, process.argv[2] is the command name 'backfill-bo-count'
  // So actual args start at index 3
  const args = process.argv.slice(3);

  // Parse arguments
  const date = args[0];
  const orgFlag = args.indexOf('--org');
  const orgId = orgFlag !== -1 ? args[orgFlag + 1] : null;

  if (!date) {
    console.error('❌ Error: Date parameter is required');
    console.error('Usage: npm run cli backfill-bo-count <date> [--org <facility_id>]');
    console.error('Example: npm run cli backfill-bo-count 2026-02-03');
    process.exit(1);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ Error: Date must be in YYYY-MM-DD format');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill BO Count from Firestore             ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log(`Date: ${date}`);
  console.log(`Target: ${orgId || 'All Organizations'}\n`);

  try {
    let totalUpdated = 0;

    if (orgId) {
      // Single organization
      const org = ORGANIZATIONS.find((o) => o.facilityId === orgId);
      if (!org) {
        console.error(`❌ Unknown facility ID: ${orgId}`);
        console.error(`Valid IDs: ${ORGANIZATIONS.map((o) => o.facilityId).join(', ')}`);
        process.exit(1);
      }

      console.log(`\n📋 Processing: ${org.name} (${org.facilityId})`);
      console.log('─'.repeat(50));

      const updated = await fetchAndStoreBoCountForMissingOrders(date, org.facilityId);
      totalUpdated += updated;

      console.log(`\n✅ Completed: ${org.name}`);
      console.log(`   Orders updated: ${updated}`);
    } else {
      // All organizations
      console.log(`Processing ${ORGANIZATIONS.length} organizations...\n`);

      for (const org of ORGANIZATIONS) {
        console.log(`\n📋 Processing: ${org.name} (${org.facilityId})`);
        console.log('─'.repeat(50));

        try {
          const updated = await fetchAndStoreBoCountForMissingOrders(date, org.facilityId);
          totalUpdated += updated;

          console.log(`✅ Completed: ${org.name}`);
          console.log(`   Orders updated: ${updated}`);
        } catch (error: any) {
          console.error(`❌ Error processing ${org.name}:`, error.message);
          // Continue with other orgs
        }
      }
    }

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  BACKFILL COMPLETE                             ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`\n📊 Summary:`);
    console.log(`   Date: ${date}`);
    console.log(`   Organizations: ${orgId ? '1' : ORGANIZATIONS.length}`);
    console.log(`   Total orders updated: ${totalUpdated}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
