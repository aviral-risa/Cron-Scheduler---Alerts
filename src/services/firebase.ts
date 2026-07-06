import admin from 'firebase-admin';
import { existsSync } from 'fs';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import type { FirebaseOrder } from '../types/orders';
import { FACILITY_IDS } from '../config/organizations';
import { toISTTimestamp, toISTDate, toISTHour, toISTTimestampOrEmpty } from '../utils/timezone';

// Support both browser (import.meta.env) and Node.js (process.env)
// For Cloud Functions build, we only use process.env
const getEnv = (key: string) => {
  return process.env[key];
};

// Initialize Firebase Admin SDK with service account credentials
let adminApp: admin.app.App | null = null;

// Initialize Firebase Client SDK for browser authentication
let clientApp: FirebaseApp | null = null;
let clientAuth: Auth | null = null;

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    // Check if any app is already initialized
    if (admin.apps.length > 0) {
      adminApp = admin.apps[0];
    } else {
      // Try JSON key file path first (Cloud Functions, preferred)
      const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

      if (keyPath && existsSync(keyPath)) {
        console.log('Initializing Firebase Admin with service account key file...');
        adminApp = admin.initializeApp({
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

        adminApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      }
    }
  }
  return adminApp;
}

const COLLECTION_PATH = getEnv('VITE_FIRESTORE_COLLECTION') || 'medical_pa_orders';

/**
 * Get Firebase client app instance for browser authentication
 */
export function getClientApp(): FirebaseApp {
  if (!clientApp) {
    // Build config object
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // Validate that all required environment variables are present
    const missing = Object.entries(firebaseConfig)
      .filter(([_, value]) => !value)
      .map(([key]) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

    if (missing.length > 0) {
      const errorMsg = `Firebase configuration incomplete. Missing environment variables: ${missing.join(', ')}`;
      console.error('[Firebase]', errorMsg);
      console.error('[Firebase] Make sure your .env file has all VITE_FIREBASE_* variables set');
      throw new Error(errorMsg);
    }

    // Initialize Firebase
    try {
      console.log('[Firebase] Initializing client app...');
      clientApp = initializeApp(firebaseConfig, 'client-app');
      console.log('[Firebase] ✓ Client app initialized successfully');
    } catch (error: any) {
      console.error('[Firebase] ✗ Failed to initialize client app:', error);
      throw new Error(`Firebase initialization failed: ${error.message}`);
    }
  }
  return clientApp;
}

/**
 * Get Firebase Auth instance for Google authentication
 */
export function getClientAuth(): Auth {
  if (!clientAuth) {
    clientAuth = getAuth(getClientApp());
  }
  return clientAuth;
}

/**
 * Fetch orders for a specific date using service account credentials
 * @param date - The date to fetch orders for
 * @param facilityId - Optional facility ID to query. If not provided, queries all facilities.
 */
export async function fetchOrdersByDate(date: Date, facilityId?: string): Promise<FirebaseOrder[]> {
  try {
    const app = getAdminApp();
    const db = app.firestore();

    // Format timestamps to match Firebase storage format: "2025-12-02T02:08:24.550843+00:00"
    // Note: Timestamps use ISO format with 'T' separator and +00:00 suffix
    // For a date like Jan 2, we query: "2026-01-02T00:00:00" to "2026-01-02T23:59:59"

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const startOfDayStr = `${year}-${month}-${day}T00:00:00`;
    const endOfDayStr = `${year}-${month}-${day}T23:59:59`;

    console.log(`Querying orders from ${startOfDayStr} to ${endOfDayStr}`);

    const orders: FirebaseOrder[] = [];

    // Query with date range using auth_on_file.created_at (INDEXED field)
    console.log('Querying all orders by date range (using auth_on_file.created_at)...');

    console.log(`DEBUG: Collection path: ${COLLECTION_PATH}`);
    console.log(`DEBUG: Query field: auth_on_file.created_at`);
    console.log(`DEBUG: Start: ${startOfDayStr}`);
    console.log(`DEBUG: End: ${endOfDayStr}`);

    // Query using date-only string for start, and date+time for end
    const startDateStr = `${year}-${month}-${day}`; // "2026-01-03"
    const endDateStr = `${year}-${month}-${day}T23:59:59`; // "2026-01-03T23:59:59"

    // Query only specified facility, or all facilities if not specified
    const facilityIdsToQuery = facilityId ? [facilityId] : FACILITY_IDS;

    console.log(`Querying ${facilityIdsToQuery.length} facility(ies) for date range: ${startDateStr} to ${endDateStr}`);

    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const fid of facilityIdsToQuery) {
      console.log(`  Querying facility: ${fid}...`);

      // Fetch in batches of 500 documents to avoid timeout on large datasets
      const BATCH_SIZE = 500;
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let hasMore = true;
      let totalFetched = 0;

      while (hasMore) {
        console.log(`    Fetching batch (starting from doc ${totalFetched})...`);
        const batchStart = Date.now();

        let query = db
          .collection(COLLECTION_PATH)
          .where('assigned_to.facility_id', '==', fid)
          .where('timestamps.created_at', '>=', startDateStr)
          .where('timestamps.created_at', '<=', endDateStr)
          .limit(BATCH_SIZE);

        // For subsequent batches, start after the last document
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const queryPromise = query.get();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Firebase query timeout for facility ${fid} (batch starting at ${totalFetched}). This usually indicates a missing composite index. Create an index on 'assigned_to.facility_id' (Ascending) and 'auth_on_file.created_at' (Ascending) in Firestore.`)), 120000)
        );

        const batchSnapshot = await Promise.race([queryPromise, timeoutPromise]);
        const batchSize = batchSnapshot.size;
        const batchTime = Date.now() - batchStart;
        totalFetched += batchSize;

        if (batchSize > 0) {
          allDocs.push(...batchSnapshot.docs);
          lastDoc = batchSnapshot.docs[batchSnapshot.docs.length - 1];
          console.log(`    ✓ Batch completed: ${batchSize} orders in ${batchTime}ms (total: ${totalFetched})`);
        }

        // If we got fewer docs than BATCH_SIZE, we've reached the end
        hasMore = batchSize === BATCH_SIZE;
      }

      console.log(`    ✓ Found ${totalFetched} total orders for ${fid}`);
    }

    console.log(`Found ${allDocs.length} total orders across all facilities`);

    allDocs.forEach((doc) => {
      const data = doc.data();

      // Timestamps are already stored as ISO strings, just use them directly
      const createdAt = data.timestamps?.created_at || '';
      const assignedAt = data.timestamps?.assigned_at || null;
      const dateOfWork = data.timestamps?.date_of_work || null;

      orders.push({
        id: doc.id,
        assigned_to: data.assigned_to || {},
        status: data.status || {},
        timestamps: {
          created_at: createdAt,
          assigned_at: assignedAt,
          date_of_work: dateOfWork,
        },
        payload: data.payload || {},
      } as FirebaseOrder);
    });

    console.log(`✓ Fetched ${orders.length} total orders for ${date.toISOString().split('T')[0]}`);
    return orders;
  } catch (error) {
    console.error('Error fetching orders from Firebase:', error);
    throw error;
  }
}

/**
 * Transform Firebase order to standardized format with IST timestamps
 */
export function transformFirebaseOrder(order: FirebaseOrder): any {
  const providerName = order.assigned_to?.provider_name;
  const isAssigned = providerName && providerName.toLowerCase() !== 'unassigned';
  const isWorked = !!order.timestamps?.date_of_work;

  // Snapshot fields use CURRENT time (when script runs)
  const currentTime = new Date();

  // Extract date from order's created_at timestamp
  const createdAtIST = toISTTimestampOrEmpty(order.timestamps?.created_at);
  const createdAtDate = createdAtIST ? createdAtIST.split(' ')[0] : '';

  return {
    snapshot_timestamp: toISTTimestamp(currentTime),
    snapshot_hour_ist: String(toISTHour(currentTime)),
    order_id: order.id,
    facility_id: order.assigned_to?.facility_id || '',
    provider_name: isAssigned ? providerName : null,
    master_auth_status: order.status?.master_auth_status || 'unknown',
    created_at: createdAtIST,
    created_at_date: createdAtDate,
    assigned_at: toISTTimestampOrEmpty(order.timestamps?.assigned_at),
    date_of_work: toISTTimestampOrEmpty(order.timestamps?.date_of_work),
    is_assigned: isAssigned,
    is_worked: isWorked,
  };
}
