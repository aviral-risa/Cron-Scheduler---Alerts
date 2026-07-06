#!/usr/bin/env tsx
/**
 * Deep Comparison: Algolia vs Firestore Field-Level Analysis
 *
 * Compares individual order fields to validate data quality
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { algoliaFetchService } from '../services/algolia-fetch.service';
import { algoliaTransformService } from '../services/algolia-transform.service';
import { getOrganizationByFacilityId } from '../config/test-sheet.config';
import { createLogger } from '../utils/logger';
import { toISTTimestampOrEmpty } from '../utils/timezone';
import type { OrderSnapshot } from '../../../src/types/orders';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainEnvPath = path.join(__dirname, '../../.env');
dotenv.config({ path: mainEnvPath });

const testEnvPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: testEnvPath });

const logger = createLogger('DeepCompare');

interface FieldComparison {
  field_name: string;
  matches: number;
  mismatches: number;
  null_in_firestore: number;
  null_in_algolia: number;
  sample_mismatch?: {
    order_id: string;
    firestore_value: any;
    algolia_value: any;
  };
}

/**
 * Initialize Firebase
 */
function initFirebase() {
  const privateKey = process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  return getFirestore();
}

/**
 * Fetch and transform from Firestore
 */
async function fetchFromFirestore(
  db: FirebaseFirestore.Firestore,
  facilityId: string,
  date: string
): Promise<Map<string, OrderSnapshot>> {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  logger.info(`Fetching from Firestore for ${facilityId}...`);

  const snapshot = await db
    .collection('medical_pa_orders')
    .where('assigned_to.facility_id', '==', facilityId)
    .where('auth_on_file.created_at', '>=', startOfDay)
    .where('auth_on_file.created_at', '<=', endOfDay)
    .get();

  const ordersMap = new Map<string, OrderSnapshot>();
  const currentTime = new Date();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const providerName = data.assigned_to?.provider_name;
    const isAssigned = !!providerName && providerName !== 'unassigned';
    const isWorked = !!data.timestamps?.date_of_work;
    const createdAt = toISTTimestampOrEmpty(data.timestamps?.created_at);

    const orderSnapshot: OrderSnapshot = {
      snapshot_timestamp: '',
      snapshot_hour_ist: '',
      order_id: doc.id,
      facility_id: data.assigned_to?.facility_id || '',
      provider_name: isAssigned ? providerName : null,
      master_auth_status: data.status?.master_auth_status || 'unknown',
      created_at: createdAt,
      created_at_date: createdAt ? createdAt.split(' ')[0] : '',
      assigned_at: toISTTimestampOrEmpty(data.timestamps?.assigned_at),
      date_of_work: toISTTimestampOrEmpty(data.timestamps?.date_of_work),
      is_assigned: isAssigned,
      is_worked: isWorked,
    };

    ordersMap.set(doc.id, orderSnapshot);
  });

  logger.success(`Fetched ${ordersMap.size} orders from Firestore`);
  return ordersMap;
}

/**
 * Fetch and transform from Algolia
 */
async function fetchFromAlgolia(
  facilityId: string,
  date: string
): Promise<Map<string, OrderSnapshot>> {
  logger.info(`Fetching from Algolia for ${facilityId}...`);

  const orders = await algoliaFetchService.fetchOrdersByDate(facilityId, date);
  const snapshots = algoliaTransformService.transformOrders(orders);

  const ordersMap = new Map<string, OrderSnapshot>();
  snapshots.forEach((s) => ordersMap.set(s.order_id, s));

  logger.success(`Fetched ${ordersMap.size} orders from Algolia`);
  return ordersMap;
}

/**
 * Compare field values
 */
function compareFields(
  firestoreOrders: Map<string, OrderSnapshot>,
  algoliaOrders: Map<string, OrderSnapshot>
): { fieldComparisons: FieldComparison[]; commonOrderIds: string[] } {
  // Get common order IDs
  const firestoreIds = new Set(firestoreOrders.keys());
  const algoliaIds = new Set(algoliaOrders.keys());
  const commonOrderIds = [...firestoreIds].filter((id) => algoliaIds.has(id));

  logger.info(`Comparing ${commonOrderIds.length} common orders...`);

  const fields: (keyof OrderSnapshot)[] = [
    'order_id',
    'facility_id',
    'provider_name',
    'master_auth_status',
    'created_at_date',
    'is_assigned',
    'is_worked',
  ];

  const fieldComparisons: FieldComparison[] = fields.map((field) => {
    let matches = 0;
    let mismatches = 0;
    let nullInFirestore = 0;
    let nullInAlgolia = 0;
    let sampleMismatch: any = null;

    commonOrderIds.forEach((orderId) => {
      const fsOrder = firestoreOrders.get(orderId)!;
      const algOrder = algoliaOrders.get(orderId)!;

      const fsValue = fsOrder[field];
      const algValue = algOrder[field];

      if (fsValue === null || fsValue === '') nullInFirestore++;
      if (algValue === null || algValue === '') nullInAlgolia++;

      if (fsValue === algValue) {
        matches++;
      } else {
        mismatches++;
        if (!sampleMismatch) {
          sampleMismatch = {
            order_id: orderId,
            firestore_value: fsValue,
            algolia_value: algValue,
          };
        }
      }
    });

    return {
      field_name: field,
      matches,
      mismatches,
      null_in_firestore: nullInFirestore,
      null_in_algolia: nullInAlgolia,
      sample_mismatch: sampleMismatch,
    };
  });

  return { fieldComparisons, commonOrderIds };
}

/**
 * Main analysis
 */
async function main() {
  const facilityId = process.argv[2] || '4BlQ4SsqAVTDgFKApKZr'; // CHC
  const date = process.argv[3] || '2026-01-10';

  try {
    const org = getOrganizationByFacilityId(facilityId);

    logger.header(`Deep Field Comparison: ${org?.name || 'Unknown'}`);
    logger.info(`Facility ID: ${facilityId}`);
    logger.info(`Date: ${date}`);
    logger.blank();

    // Initialize Firestore
    const db = initFirebase();

    // Fetch from both sources
    const [firestoreOrders, algoliaOrders] = await Promise.all([
      fetchFromFirestore(db, facilityId, date),
      fetchFromAlgolia(facilityId, date),
    ]);

    logger.blank();
    logger.header('Order Count Analysis');

    const firestoreIds = new Set(firestoreOrders.keys());
    const algoliaIds = new Set(algoliaOrders.keys());
    const commonIds = [...firestoreIds].filter((id) => algoliaIds.has(id));
    const onlyInFirestore = [...firestoreIds].filter((id) => !algoliaIds.has(id));
    const onlyInAlgolia = [...algoliaIds].filter((id) => !firestoreIds.has(id));

    console.log(`Firestore total:       ${firestoreOrders.size}`);
    console.log(`Algolia total:         ${algoliaOrders.size}`);
    console.log(`Common orders:         ${commonIds.length}`);
    console.log(`Only in Firestore:     ${onlyInFirestore.length}`);
    console.log(`Only in Algolia:       ${onlyInAlgolia.length}`);
    logger.blank();

    if (onlyInAlgolia.length > 0) {
      logger.info('Sample of orders ONLY in Algolia (first 5):');
      onlyInAlgolia.slice(0, 5).forEach((id) => {
        const order = algoliaOrders.get(id)!;
        console.log(`  ${id}: created=${order.created_at_date}, status=${order.master_auth_status}`);
      });
      logger.blank();
    }

    // Field-level comparison
    logger.header('Field-Level Comparison (Common Orders)');

    const { fieldComparisons } = compareFields(firestoreOrders, algoliaOrders);

    console.log('┌────────────────────────┬─────────┬────────────┬─────────────────┬──────────────────┐');
    console.log('│ Field                  │ Matches │ Mismatches │ Null (Firestore)│ Null (Algolia)   │');
    console.log('├────────────────────────┼─────────┼────────────┼─────────────────┼──────────────────┤');

    fieldComparisons.forEach((fc) => {
      const matchRate = ((fc.matches / commonIds.length) * 100).toFixed(1);
      console.log(
        `│ ${fc.field_name.padEnd(22)} │ ${String(fc.matches).padStart(7)} │ ${String(fc.mismatches).padStart(10)} │ ${String(fc.null_in_firestore).padStart(15)} │ ${String(fc.null_in_algolia).padStart(16)} │`
      );
    });

    console.log('└────────────────────────┴─────────┴────────────┴─────────────────┴──────────────────┘');
    logger.blank();

    // Show mismatches
    const fieldsMismatched = fieldComparisons.filter((fc) => fc.mismatches > 0);
    if (fieldsMismatched.length > 0) {
      logger.warn(`Found mismatches in ${fieldsMismatched.length} fields:`);
      fieldsMismatched.forEach((fc) => {
        logger.warn(`  ${fc.field_name}: ${fc.mismatches} mismatches`);
        if (fc.sample_mismatch) {
          logger.info(`    Sample: Order ${fc.sample_mismatch.order_id}`);
          logger.info(`      Firestore: ${JSON.stringify(fc.sample_mismatch.firestore_value)}`);
          logger.info(`      Algolia: ${JSON.stringify(fc.sample_mismatch.algolia_value)}`);
        }
      });
      logger.blank();
    }

    // Final verdict
    logger.header('Analysis Summary');

    const totalMatches = fieldComparisons.reduce((sum, fc) => sum + fc.matches, 0);
    const totalComparisons = commonIds.length * fieldComparisons.length;
    const overallMatchRate = ((totalMatches / totalComparisons) * 100).toFixed(2);

    logger.info(`Common orders: ${commonIds.length}/${Math.max(firestoreOrders.size, algoliaOrders.size)} (${((commonIds.length / Math.max(firestoreOrders.size, algoliaOrders.size)) * 100).toFixed(1)}%)`);
    logger.info(`Field match rate: ${overallMatchRate}%`);
    logger.blank();

    if (parseFloat(overallMatchRate) >= 99.5) {
      logger.success('✅ Data quality: EXCELLENT (>99.5% match)');
    } else if (parseFloat(overallMatchRate) >= 95) {
      logger.success('✅ Data quality: GOOD (>95% match)');
    } else {
      logger.warn('⚠️ Data quality: NEEDS REVIEW (<95% match)');
    }

    if (onlyInAlgolia.length > 0) {
      logger.blank();
      logger.info(`📊 Algolia has ${onlyInAlgolia.length} additional orders`);
      logger.info('   This suggests Algolia index is more complete/current');
    }
  } catch (error: any) {
    logger.blank();
    logger.error('Deep comparison failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
