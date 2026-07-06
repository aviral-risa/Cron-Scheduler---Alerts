/**
 * Backfill Patient MRN for ALL Orders
 *
 * Reads all orders from unique_orders_status that are missing patient_mrn,
 * groups by date+org, re-fetches from Algolia, and writes patient_mrn to column AP.
 *
 * Usage:
 *   npm run cli backfill-mrn
 *   npm run cli backfill-mrn -- --org nycbs
 *   npm run cli backfill-mrn -- --org nycbs,chc
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { algoliaFetchService } from '../services/algolia/fetch.service';
import { ORGANIZATIONS } from '../config/organizations';

export async function backfillMrn() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Backfill Patient MRN from Algolia            ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  // Parse optional --org filter
  let orgFilter: Set<string> | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--org' && process.argv[i + 1]) {
      orgFilter = new Set<string>();
      const orgIds = process.argv[i + 1].toLowerCase().split(',');
      for (const orgId of orgIds) {
        const org = ORGANIZATIONS.find((o) => o.id === orgId.trim());
        if (!org) {
          console.error(`❌ Unknown org '${orgId.trim()}'. Valid: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`);
          process.exit(1);
        }
        orgFilter.add(org.facilityId);
      }
      console.log(`Filtering to orgs: ${orgIds.join(', ')}\n`);
      break;
    }
  }

  try {
    console.log('Reading unique_orders_status sheet...\n');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      console.log('No data found');
      return;
    }

    const headers = rows[0];
    const orderIdIdx = headers.indexOf('order_id');
    const createdAtIdx = headers.indexOf('created_at_iso');
    const orgIdIdx = headers.indexOf('org_id');
    const mrnIdx = headers.indexOf('patient_mrn');

    // If patient_mrn header doesn't exist yet, it will be at index 41
    const mrnColIdx = mrnIdx !== -1 ? mrnIdx : 41;
    const mrnColLetter = 'AP';

    console.log(`Total orders in sheet: ${rows.length - 1}`);

    // Find all orders missing patient_mrn
    const missingOrders: Array<{ orderId: string; rowIndex: number; date: string; org: string }> = [];

    rows.slice(1).forEach((row, idx) => {
      const mrn = row[mrnColIdx];
      const orgId = row[orgIdIdx];

      // Skip if org filter is set and this org doesn't match
      if (orgFilter && !orgFilter.has(orgId)) return;

      if (!mrn || mrn === '') {
        const orderId = row[orderIdIdx];
        const createdAt = row[createdAtIdx];
        const orderDate = createdAt?.split('T')[0]?.split(' ')[0] || 'unknown';

        missingOrders.push({
          orderId,
          rowIndex: idx + 2, // +2 for header and 1-indexing
          date: orderDate,
          org: orgId,
        });
      }
    });

    if (missingOrders.length === 0) {
      console.log('🎉 All orders already have patient_mrn populated!');
      return;
    }

    console.log(`Found ${missingOrders.length} orders missing patient_mrn\n`);

    // Group by date + org for efficient Algolia fetching
    const byDateOrg = new Map<string, typeof missingOrders>();
    missingOrders.forEach((order) => {
      const key = `${order.date}|${order.org}`;
      if (!byDateOrg.has(key)) {
        byDateOrg.set(key, []);
      }
      byDateOrg.get(key)!.push(order);
    });

    const groups = Array.from(byDateOrg.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    console.log(`Processing ${groups.length} unique date+org combinations...\n`);
    console.log('═'.repeat(70));

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalMrnFound = 0;

    for (const [key, groupOrders] of groups) {
      const [date, orgId] = key.split('|');
      const orgName = ORGANIZATIONS.find((o) => o.facilityId === orgId)?.name || orgId;

      console.log(`\n📅 ${date} | ${orgName}: ${groupOrders.length} orders missing MRN`);
      console.log('─'.repeat(70));

      // Fetch orders from Algolia for this date + org
      let algoliaOrders;
      try {
        console.log(`   Fetching from Algolia...`);
        algoliaOrders = await algoliaFetchService.fetchOrdersByDate(orgId, date);
      } catch (error: any) {
        console.error(`   ❌ Algolia fetch failed: ${error.message}`);
        continue;
      }

      // Build map of order_id -> patient_mrn from Algolia response (stored as patient_id in Algolia)
      const mrnMap = new Map<string, string>();
      for (const order of algoliaOrders) {
        const orderId = order.id || order.order_id || order.objectID;
        const mrn = order.patient_id;
        if (orderId && mrn) {
          mrnMap.set(orderId, mrn);
        }
      }

      console.log(`   Algolia returned ${algoliaOrders.length} orders, ${mrnMap.size} with MRN`);

      // Prepare batch update for column AP
      const updates: Array<{ range: string; values: any[][] }> = [];

      for (const order of groupOrders) {
        const mrn = mrnMap.get(order.orderId);
        if (mrn) {
          updates.push({
            range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!${mrnColLetter}${order.rowIndex}`,
            values: [[mrn]],
          });
        }
      }

      if (updates.length > 0) {
        // Batch update in chunks (Sheets API limit)
        const BATCH_SIZE = 5000;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'RAW',
              data: batch,
            },
          });
        }

        console.log(`   ✅ Updated ${updates.length}/${groupOrders.length} orders with MRN`);
        totalMrnFound += updates.length;
      } else {
        console.log(`   ⚠️  No MRN values found in Algolia for these orders`);
      }

      totalProcessed += groupOrders.length;
      totalUpdated += updates.length;
    }

    console.log('\n' + '═'.repeat(70));
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  MRN BACKFILL COMPLETE                        ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   Total Orders Missing MRN: ${missingOrders.length.toLocaleString()}`);
    console.log(`   Total Processed: ${totalProcessed.toLocaleString()}`);
    console.log(`   Total MRN Populated: ${totalMrnFound.toLocaleString()}`);
    console.log(`   Date+Org Groups: ${groups.length}`);
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}
