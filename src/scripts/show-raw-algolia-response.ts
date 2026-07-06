/**
 * Show Raw Algolia Response
 *
 * Fetches a few sample orders from Algolia and displays the raw JSON response
 */

import 'dotenv/config';
import { fetchOrdersByDate } from '../services/data-source';
import { ORGANIZATIONS } from '../config/organizations';

export async function showRawAlgoliaResponse() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Raw Algolia Response Sample                  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    // Fetch orders for NYCBS today
    const testOrg = ORGANIZATIONS[0]; // NYCBS
    console.log(`Fetching orders for ${testOrg.name} (${testOrg.facilityId})...\n`);

    const result = await fetchOrdersByDate(new Date(), testOrg.facilityId);

    if (result.algoliaOrders && result.algoliaOrders.length > 0) {
      console.log(`✅ Fetched ${result.algoliaOrders.length} orders\n`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('SAMPLE ORDER 1 (Full JSON):');
      console.log('═══════════════════════════════════════════════════════\n');

      const sampleOrder = result.algoliaOrders[0];
      console.log(JSON.stringify(sampleOrder, null, 2));

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('CHECKING FOR BO_COUNT FIELD:');
      console.log('═══════════════════════════════════════════════════════\n');

      const keys = Object.keys(sampleOrder);
      const boCountVariations = keys.filter(k =>
        k.toLowerCase().includes('bo') && (k.toLowerCase().includes('count') || k.toLowerCase().includes('cnt'))
      );

      if (boCountVariations.length > 0) {
        console.log(`✅ Found BO count fields: ${boCountVariations.join(', ')}`);
        boCountVariations.forEach(key => {
          console.log(`   ${key}: ${sampleOrder[key]}`);
        });
      } else {
        console.log('❌ No bo_count or similar field found');
        console.log('\nBO-related fields found:');
        const boRelated = keys.filter(k => k.toLowerCase().includes('bo'));
        if (boRelated.length > 0) {
          boRelated.forEach(key => {
            console.log(`   ${key}: ${sampleOrder[key]}`);
          });
        } else {
          console.log('   (none)');
        }
      }

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('ALL FIELD NAMES IN RESPONSE:');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(keys.sort().join(', '));
      console.log(`\nTotal fields: ${keys.length}\n`);

    } else {
      console.log('❌ No orders returned from Algolia');
    }

  } catch (error) {
    console.error('❌ Error fetching Algolia data:', error);
  }
}
