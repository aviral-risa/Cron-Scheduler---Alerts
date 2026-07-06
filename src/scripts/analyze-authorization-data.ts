import 'dotenv/config';
import admin from 'firebase-admin';
import { existsSync } from 'fs';
import { FACILITY_IDS, getOrganizationByFacilityId } from '../config/organizations';

// Toggle between sample mode (2-3 orders) and full mode (all orders)
const SAMPLE_MODE = false;
const SAMPLE_LIMIT = 3;

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  return process.env[key];
};

interface OrderAuthData {
  orderId: string;
  facilityId: string;
  patientMrn: string | null;
  authTotal: number;
  authEntriesCount: number;
  hasAuthData: boolean;
}

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  // Try JSON key file path first (Cloud Functions, preferred)
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (keyPath && existsSync(keyPath)) {
    console.log('Initializing Firebase Admin with service account key file...');
    return admin.initializeApp({
      credential: admin.credential.cert(keyPath),
      projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
    });
  } else {
    // Fallback to individual env vars (local dev)
    console.log('Initializing Firebase Admin with service account credentials from env...');
    const privateKey = getEnv('VITE_GOOGLE_PRIVATE_KEY');
    const clientEmail = getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const projectId = getEnv('VITE_FIREBASE_PROJECT_ID');

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error(
        'Missing Firebase credentials. Please set GOOGLE_APPLICATION_CREDENTIALS or provide VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL, VITE_GOOGLE_PRIVATE_KEY, and VITE_FIREBASE_PROJECT_ID in environment variables.'
      );
    }

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }
}

/**
 * Fetch authorization data for orders created on a specific date
 */
async function analyzeAuthorizationData(targetDate: Date) {
  console.log('='.repeat(60));
  console.log('AUTHORIZATION DATA ANALYSIS');
  console.log('='.repeat(60));
  console.log(`Mode: ${SAMPLE_MODE ? 'SAMPLE (2-3 orders)' : 'FULL (all orders)'}`);
  console.log(`Target Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log('='.repeat(60));
  console.log();

  // Initialize Firebase
  console.log('Initializing Firebase Admin SDK...');
  const app = initializeFirebase();
  const db = app.firestore();
  console.log('✓ Firebase initialized successfully\n');

  // Date range for query
  const dateStr = targetDate.toISOString().split('T')[0];
  const startDateStr = `${dateStr}`;
  const endDateStr = `${dateStr}T23:59:59`;

  const results: OrderAuthData[] = [];

  // In SAMPLE_MODE, only query NYCBS facility
  const facilitiesToQuery = SAMPLE_MODE ? [FACILITY_IDS[0]] : FACILITY_IDS;

  for (const facilityId of facilitiesToQuery) {
    const org = getOrganizationByFacilityId(facilityId);
    console.log(`Querying facility: ${org?.name || facilityId}...`);

    try {
      // Query orders for this facility and date
      let query = db
        .collection('medical_pa_orders')
        .where('assigned_to.facility_id', '==', facilityId)
        .where('timestamps.created_at', '>=', startDateStr)
        .where('timestamps.created_at', '<=', endDateStr);

      if (SAMPLE_MODE) {
        query = query.limit(SAMPLE_LIMIT);
      }

      const snapshot = await query.get();
      console.log(`  ✓ Found ${snapshot.size} orders`);

      // Process each order
      for (const doc of snapshot.docs) {
        const orderData = doc.data();
        const orderId = doc.id;

        // Extract main document data
        const facilityId = orderData.assigned_to?.facility_id || '';
        const patientMrn = orderData.demographics?.patient_mrn || null;

        // Access authorization subcollection
        try {
          const authDocRef = db
            .collection('medical_pa_orders')
            .doc(orderId)
            .collection('clinical_data')
            .doc('authorization');

          const authSnapshot = await authDocRef.get();

          let authTotal = 0;
          let authEntriesCount = 0;
          let hasAuthData = false;

          if (authSnapshot.exists) {
            const authData = authSnapshot.data();
            authTotal = authData?.total || 0;
            const entries = authData?.entries || [];
            authEntriesCount = Array.isArray(entries) ? entries.length : 0;
            hasAuthData = true;

            if (SAMPLE_MODE) {
              // In sample mode, show detailed data structure
              console.log(`\n  Order: ${orderId}`);
              console.log(`    Facility ID: ${facilityId}`);
              console.log(`    Patient MRN: ${patientMrn || '(not set)'}`);
              console.log(`    Authorization Total: ${authTotal}`);
              console.log(`    Entries Count: ${authEntriesCount}`);
              console.log(`    Has Auth Data: ${hasAuthData}`);
              if (authData) {
                console.log(`    Auth Data Keys: ${Object.keys(authData).join(', ')}`);
              }
            }
          } else {
            if (SAMPLE_MODE) {
              console.log(`\n  Order: ${orderId}`);
              console.log(`    Facility ID: ${facilityId}`);
              console.log(`    Patient MRN: ${patientMrn || '(not set)'}`);
              console.log(`    Authorization: NO SUBCOLLECTION DATA`);
            }
          }

          results.push({
            orderId,
            facilityId,
            patientMrn,
            authTotal,
            authEntriesCount,
            hasAuthData,
          });
        } catch (error) {
          console.error(`  ✗ Error fetching auth data for order ${orderId}:`, error);
          results.push({
            orderId,
            facilityId,
            patientMrn,
            authTotal: 0,
            authEntriesCount: 0,
            hasAuthData: false,
          });
        }
      }

      console.log(`  ✓ Processed ${snapshot.size} orders from ${org?.name || facilityId}\n`);
    } catch (error) {
      console.error(`  ✗ Error querying facility ${facilityId}:`, error);
    }
  }

  // Output results
  console.log();
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log();

  if (SAMPLE_MODE) {
    console.log('SAMPLE MODE - Data Structure Validation');
    console.log('-'.repeat(60));
    console.log(`Total Orders Fetched: ${results.length}`);
    console.log(`Orders with Auth Data: ${results.filter(r => r.hasAuthData).length}`);
    console.log(`Orders without Auth Data: ${results.filter(r => !r.hasAuthData).length}`);
    console.log();
    console.log('Sample Data:');
    console.log(JSON.stringify(results, null, 2));
    console.log();
    console.log('='.repeat(60));
    console.log('⚠️  SAMPLE MODE ENABLED');
    console.log('To run full analysis, set SAMPLE_MODE = false in the script');
    console.log('='.repeat(60));
  } else {
    // Full mode - output CSV and statistics
    outputCSV(results);
    outputStatistics(results);
  }
}

/**
 * Output CSV format
 */
function outputCSV(results: OrderAuthData[]) {
  console.log('CSV OUTPUT:');
  console.log('-'.repeat(60));
  console.log('order_id,facility_id,patient_mrn,auth_total,entries_count,has_auth_data');

  results.forEach(row => {
    console.log(
      `${row.orderId},${row.facilityId},${row.patientMrn || ''},${row.authTotal},${row.authEntriesCount},${row.hasAuthData}`
    );
  });

  console.log();
}

/**
 * Calculate and output statistics
 */
function outputStatistics(results: OrderAuthData[]) {
  console.log();
  console.log('='.repeat(60));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(60));
  console.log();

  const totalOrders = results.length;
  const ordersWithAuth = results.filter(r => r.hasAuthData).length;
  const ordersWithoutAuth = totalOrders - ordersWithAuth;
  const percentWithAuth = totalOrders > 0 ? (ordersWithAuth / totalOrders) * 100 : 0;

  const totalAuthLetters = results.reduce((sum, r) => sum + r.authEntriesCount, 0);
  const avgAuthLettersAll = totalOrders > 0 ? totalAuthLetters / totalOrders : 0;
  const avgAuthLettersWithData = ordersWithAuth > 0 ? totalAuthLetters / ordersWithAuth : 0;

  console.log(`Total Orders Analyzed: ${totalOrders.toLocaleString()}`);
  console.log();
  console.log(`Orders with Auth Letters: ${ordersWithAuth.toLocaleString()} (${percentWithAuth.toFixed(1)}%)`);
  console.log(`Orders without Auth Letters: ${ordersWithoutAuth.toLocaleString()} (${(100 - percentWithAuth).toFixed(1)}%)`);
  console.log();
  console.log(`Total Authorization Letters: ${totalAuthLetters.toLocaleString()}`);
  console.log(`Average Auth Letters per Order (all): ${avgAuthLettersAll.toFixed(2)}`);
  console.log(`Average Auth Letters per Order (with data): ${avgAuthLettersWithData.toFixed(2)}`);
  console.log();

  // Facility breakdown
  console.log('='.repeat(60));
  console.log('FACILITY BREAKDOWN');
  console.log('='.repeat(60));
  console.log();

  for (const facilityId of FACILITY_IDS) {
    const org = getOrganizationByFacilityId(facilityId);
    const facilityResults = results.filter(r => r.facilityId === facilityId);

    if (facilityResults.length === 0) continue;

    const facilityWithAuth = facilityResults.filter(r => r.hasAuthData).length;
    const facilityTotalAuth = facilityResults.reduce((sum, r) => sum + r.authEntriesCount, 0);
    const facilityPercentWithAuth = (facilityWithAuth / facilityResults.length) * 100;
    const facilityAvgAuth = facilityWithAuth > 0 ? facilityTotalAuth / facilityWithAuth : 0;

    console.log(`${org?.name || facilityId}:`);
    console.log(`  Orders: ${facilityResults.length.toLocaleString()}`);
    console.log(`  With Auth: ${facilityWithAuth.toLocaleString()} (${facilityPercentWithAuth.toFixed(1)}%)`);
    console.log(`  Avg Letters: ${facilityAvgAuth.toFixed(2)}`);
    console.log();
  }

  console.log('='.repeat(60));
  console.log('✓ Analysis complete');
  console.log('='.repeat(60));
}

// Entry point
const targetDate = new Date('2026-01-18');
analyzeAuthorizationData(targetDate).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
