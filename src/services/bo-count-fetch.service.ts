/**
 * BO Count Fetch Service
 *
 * Fetches bo_count from Firestore for orders that don't have it populated yet
 */

import admin from 'firebase-admin';
import { existsSync } from 'fs';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from './sheets-dual';

// Initialize Firebase Admin (reuse existing pattern from firebase.ts)
function getFirestoreDb() {
  if (admin.apps.length === 0) {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.VITE_GOOGLE_PRIVATE_KEY;

    if (keyPath && existsSync(keyPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(keyPath),
        projectId,
      });
    } else if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      throw new Error('Missing Firebase credentials');
    }
  }

  return admin.apps[0]!.firestore();
}

/**
 * Fetch bo_count from Firestore for a single order
 */
export async function fetchBoCountForOrder(orderId: string): Promise<number | null> {
  try {
    const db = getFirestoreDb();
    const collection = process.env.VITE_FIRESTORE_COLLECTION || 'medical_pa_orders';

    const docRef = db.collection(collection).doc(orderId);
    const [docSnapshot] = await db.getAll(docRef, { fieldMask: ['auth_on_file.bo_count'] });

    if (!docSnapshot.exists) {
      console.log(`Order ${orderId} not found in Firestore`);
      return null;
    }

    const data = docSnapshot.data();
    const boCount = data?.auth_on_file?.bo_count;

    return boCount || 1; // Default to 1 if not set
  } catch (error) {
    console.error(`Error fetching bo_count for ${orderId}:`, error);
    return null;
  }
}

/**
 * Fetch bo_count for multiple orders in batch
 * Uses getAll() which supports up to 500 docs per call,
 * with parallel execution for large sets.
 */
export async function fetchBoCountBatch(orderIds: string[], options?: { concurrency?: number }): Promise<Map<string, number>> {
  const db = getFirestoreDb();
  const collection = process.env.VITE_FIRESTORE_COLLECTION || 'medical_pa_orders';
  const concurrency = options?.concurrency ?? 5;

  const boCountMap = new Map<string, number>();

  // getAll() supports up to 500 docs per call
  const chunkSize = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    chunks.push(orderIds.slice(i, i + chunkSize));
  }

  // Process chunks in parallel with concurrency limit
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (chunk) => {
        const docRefs = chunk.map(id => db.collection(collection).doc(id));
        try {
          const snapshots = await db.getAll(...docRefs, { fieldMask: ['auth_on_file.bo_count'] });
          snapshots.forEach((snapshot, idx) => {
            if (snapshot.exists) {
              const data = snapshot.data();
              const boCount = data?.auth_on_file?.bo_count || 1;
              boCountMap.set(chunk[idx], boCount);
            } else {
              boCountMap.set(chunk[idx], 1);
            }
          });
        } catch (error) {
          console.error(`Error fetching batch of ${chunk.length}:`, error);
          chunk.forEach(id => boCountMap.set(id, 1));
        }
      })
    );
  }

  return boCountMap;
}

/**
 * Fetch and store bo_count for orders missing it in unique_orders_status
 * Run this ONCE per day, not on every sync
 */
export async function fetchAndStoreBoCountForMissingOrders(date: string, facilityId: string): Promise<number> {
  console.log(`\n🔍 Fetching missing bo_count values for ${facilityId} on ${date}...`);

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    throw new Error('UNIQUE_STATUS_SHEETS_ID not configured');
  }

  // 1. Read all orders from unique_orders_status for this date + facility
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A1:AQ10000`, // 43 columns now (A-AQ)
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return 0;

  const headers = rows[0];
  const orderIdIdx = headers.indexOf('order_id');
  const createdAtIdx = headers.indexOf('created_at_iso');
  const orgIdIdx = headers.indexOf('org_id');
  const boCountIdx = headers.indexOf('bo_count');

  if (boCountIdx === -1) {
    throw new Error('bo_count column not found in unique_orders_status sheet');
  }

  // 2. Find orders missing bo_count for this date + facility
  const ordersNeedingBoCount: string[] = [];
  const rowIndices: number[] = [];

  rows.slice(1).forEach((row, idx) => {
    const createdAt = row[createdAtIdx];
    const orgId = row[orgIdIdx];
    const orderDate = createdAt?.split('T')[0].split(' ')[0];
    const boCount = row[boCountIdx];

    if (orderDate === date && orgId === facilityId && !boCount) {
      ordersNeedingBoCount.push(row[orderIdIdx]);
      rowIndices.push(idx + 2); // +2 because: +1 for header, +1 for 0-indexing
    }
  });

  if (ordersNeedingBoCount.length === 0) {
    console.log(`✅ All orders already have bo_count populated`);
    return 0;
  }

  console.log(`📥 Fetching bo_count for ${ordersNeedingBoCount.length} orders from Firestore...`);

  // 3. Fetch bo_count from Firestore in batch
  const boCountMap = await fetchBoCountBatch(ordersNeedingBoCount);

  // 4. Update unique_orders_status sheet with bo_count values
  const updates = rowIndices.map((rowIdx, i) => {
    const orderId = ordersNeedingBoCount[i];
    const boCount = boCountMap.get(orderId) || 1;

    return {
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AO${rowIdx}`, // Column AO = bo_count
      values: [[boCount]],
    };
  });

  // Batch update all bo_count values
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  console.log(`✅ Updated ${updates.length} orders with bo_count values`);

  // Log statistics
  const boCountValues = Array.from(boCountMap.values());
  const ordersWithBoCountGreaterThan1 = boCountValues.filter(v => v > 1).length;
  console.log(`   Orders with bo_count > 1: ${ordersWithBoCountGreaterThan1}`);
  console.log(`   Max bo_count: ${Math.max(...boCountValues)}`);

  return updates.length;
}
