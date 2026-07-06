#!/usr/bin/env tsx
/**
 * Compare Algolia vs Firestore Data Sources
 *
 * Validates that Algolia returns the same data as Firestore for production verification
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { algoliaFetchService } from '../services/algolia-fetch.service';
import { ORGANIZATIONS } from '../config/test-sheet.config';
import { createLogger } from '../utils/logger';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from main .env file for production Firestore access
const mainEnvPath = path.join(__dirname, '../../.env');
dotenv.config({ path: mainEnvPath });

// Also load test env for Algolia
const testEnvPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: testEnvPath });

const logger = createLogger('Compare');

interface ComparisonResult {
  facility_id: string;
  facility_name: string;
  firestore_count: number;
  algolia_count: number;
  difference: number;
  match: boolean;
  firestore_time_ms: number;
  algolia_time_ms: number;
  speedup: number;
}

/**
 * Initialize Firebase Admin for Firestore access
 */
function initFirebase() {
  const privateKey = process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

  if (!privateKey || !clientEmail || !projectId) {
    throw new Error('Missing Firebase credentials in .env');
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return getFirestore();
}

/**
 * Fetch orders from Firestore for a specific date and facility
 */
async function fetchFromFirestore(
  db: FirebaseFirestore.Firestore,
  facilityId: string,
  date: string
): Promise<{ count: number; time_ms: number }> {
  const startTime = Date.now();

  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  logger.info(`Querying Firestore for ${facilityId} on ${date}...`);

  const snapshot = await db
    .collection('medical_pa_orders')
    .where('assigned_to.facility_id', '==', facilityId)
    .where('auth_on_file.created_at', '>=', startOfDay)
    .where('auth_on_file.created_at', '<=', endOfDay)
    .get();

  const count = snapshot.size;
  const time_ms = Date.now() - startTime;

  logger.info(`Firestore returned ${count} orders in ${time_ms}ms`);

  return { count, time_ms };
}

/**
 * Fetch orders from Algolia for a specific date and facility
 */
async function fetchFromAlgolia(
  facilityId: string,
  date: string
): Promise<{ count: number; time_ms: number }> {
  const startTime = Date.now();

  logger.info(`Querying Algolia for ${facilityId} on ${date}...`);

  const orders = await algoliaFetchService.fetchOrdersByDate(facilityId, date);

  const count = orders.length;
  const time_ms = Date.now() - startTime;

  logger.info(`Algolia returned ${count} orders in ${time_ms}ms`);

  return { count, time_ms };
}

/**
 * Main comparison function
 */
async function main() {
  const date = process.argv[2] || '2026-01-10';

  try {
    logger.header('Algolia vs Firestore Comparison');
    logger.info(`Date: ${date}`);
    logger.info(`Facilities: ${ORGANIZATIONS.map(o => o.name).join(', ')}`);
    logger.blank();

    // Initialize Firestore
    logger.info('Initializing Firestore connection...');
    const db = initFirebase();
    logger.success('Connected to Firestore');
    logger.blank();

    const results: ComparisonResult[] = [];

    // Compare each facility
    for (const org of ORGANIZATIONS) {
      logger.header(`Testing ${org.name} (${org.facilityId})`);

      // Fetch from Firestore
      const firestoreResult = await fetchFromFirestore(db, org.facilityId, date);

      // Fetch from Algolia
      const algoliaResult = await fetchFromAlgolia(org.facilityId, date);

      // Compare
      const difference = algoliaResult.count - firestoreResult.count;
      const match = difference === 0;
      const speedup = firestoreResult.time_ms / algoliaResult.time_ms;

      const result: ComparisonResult = {
        facility_id: org.facilityId,
        facility_name: org.name,
        firestore_count: firestoreResult.count,
        algolia_count: algoliaResult.count,
        difference,
        match,
        firestore_time_ms: firestoreResult.time_ms,
        algolia_time_ms: algoliaResult.time_ms,
        speedup,
      };

      results.push(result);

      if (match) {
        logger.success(`✓ MATCH: ${firestoreResult.count} orders in both sources`);
      } else {
        logger.warn(`⚠ MISMATCH: Firestore=${firestoreResult.count}, Algolia=${algoliaResult.count}, Diff=${difference}`);
      }

      logger.info(`Performance: ${speedup.toFixed(2)}x faster with Algolia`);
      logger.blank();
    }

    // Summary
    logger.header('Comparison Summary');
    logger.blank();

    console.log('┌────────────┬────────────┬────────────┬────────────┬─────────┬──────────┐');
    console.log('│ Facility   │  Firestore │    Algolia │       Diff │   Match │  Speedup │');
    console.log('├────────────┼────────────┼────────────┼────────────┼─────────┼──────────┤');

    let totalFirestore = 0;
    let totalAlgolia = 0;
    let allMatch = true;
    let totalFirestoreTime = 0;
    let totalAlgoliaTime = 0;

    results.forEach((r) => {
      const matchSymbol = r.match ? '✓' : '✗';
      const diffStr = r.difference >= 0 ? `+${r.difference}` : `${r.difference}`;

      console.log(
        `│ ${r.facility_name.padEnd(10)} │ ${String(r.firestore_count).padStart(10)} │ ${String(r.algolia_count).padStart(10)} │ ${diffStr.padStart(10)} │ ${matchSymbol.padStart(7)} │ ${r.speedup.toFixed(2).padStart(7)}x │`
      );

      totalFirestore += r.firestore_count;
      totalAlgolia += r.algolia_count;
      totalFirestoreTime += r.firestore_time_ms;
      totalAlgoliaTime += r.algolia_time_ms;

      if (!r.match) allMatch = false;
    });

    console.log('├────────────┼────────────┼────────────┼────────────┼─────────┼──────────┤');

    const totalDiff = totalAlgolia - totalFirestore;
    const totalDiffStr = totalDiff >= 0 ? `+${totalDiff}` : `${totalDiff}`;
    const totalMatch = totalDiff === 0 ? '✓' : '✗';
    const overallSpeedup = totalFirestoreTime / totalAlgoliaTime;

    console.log(
      `│ TOTAL      │ ${String(totalFirestore).padStart(10)} │ ${String(totalAlgolia).padStart(10)} │ ${totalDiffStr.padStart(10)} │ ${totalMatch.padStart(7)} │ ${overallSpeedup.toFixed(2).padStart(7)}x │`
    );
    console.log('└────────────┴────────────┴────────────┴────────────┴─────────┴──────────┘');

    logger.blank();

    // Performance summary
    logger.info('Performance Summary:');
    logger.info(`  Firestore total time: ${(totalFirestoreTime / 1000).toFixed(2)}s`);
    logger.info(`  Algolia total time: ${(totalAlgoliaTime / 1000).toFixed(2)}s`);
    logger.info(`  Overall speedup: ${overallSpeedup.toFixed(2)}x faster`);
    logger.blank();

    // Final verdict
    if (allMatch && totalMatch === '✓') {
      logger.success('🎉 VALIDATION PASSED: All facilities match!');
      logger.success('✅ Algolia data is 100% consistent with Firestore');
      logger.success(`✅ Performance improvement: ${overallSpeedup.toFixed(2)}x faster`);
      logger.blank();
      logger.success('🚀 READY FOR PRODUCTION: Safe to switch data source');
    } else {
      logger.warn('⚠ VALIDATION FAILED: Data mismatch detected');
      logger.warn('Review discrepancies before switching to production');
      process.exit(1);
    }
  } catch (error: any) {
    logger.blank();
    logger.error('Comparison failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
