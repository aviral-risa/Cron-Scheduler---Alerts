import admin from 'firebase-admin';
import type { FirebaseOrder } from '../types/orders';
import { FACILITY_IDS } from '../config/organizations';
import { toISTTimestamp, toISTDate, toISTHour, toISTTimestampOrEmpty } from '../utils/timezone';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return process.env[key];
};

// Initialize Firebase Admin SDK with Application Default Credentials (gcloud auth)
let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    // Check if any app is already initialized
    if (admin.apps.length > 0) {
      adminApp = admin.apps[0];
    } else {
      // Initialize with Application Default Credentials (from gcloud auth login)
      console.log('Initializing Firebase Admin with Application Default Credentials...');
      const projectId = getEnv('VITE_FIREBASE_PROJECT_ID');

      if (!projectId) {
        throw new Error('Missing VITE_FIREBASE_PROJECT_ID environment variable');
      }

      // Set the GCLOUD_PROJECT environment variable for Application Default Credentials
      process.env.GCLOUD_PROJECT = projectId;
      process.env.GOOGLE_CLOUD_PROJECT = projectId;

      adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId,
      });
    }
  }
  return adminApp;
}

const COLLECTION_PATH = getEnv('VITE_FIRESTORE_COLLECTION') || 'medical_pa_orders';

/**
 * Fetch orders for a specific date using gcloud auth credentials
 * @param date - The date to fetch orders for
 * @param facilityId - Optional facility ID to query. If not provided, queries all facilities.
 */
export async function fetchOrdersByDateGcloud(date: Date, facilityId?: string): Promise<FirebaseOrder[]> {
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

    // First, try to fetch a specific doc we know exists from today
    console.log('DEBUG: Fetching specific doc c6ae1e4c-2c51-4860-a28c-46d33752e4a2...');
    try {
      const testDoc = await db.collection(COLLECTION_PATH).doc('c6ae1e4c-2c51-4860-a28c-46d33752e4a2').get();
      if (testDoc.exists) {
        const testData = testDoc.data();
        console.log(`DEBUG: Test doc auth_on_file.created_at: ${testData?.auth_on_file?.created_at}`);
        console.log(`DEBUG: Test doc facility_id: ${testData?.assigned_to?.facility_id}`);
      } else {
        console.log('DEBUG: Test doc does not exist');
      }
    } catch (err) {
      console.log('DEBUG: Error fetching test doc:', err);
    }

    // Query using the SAME approach as the working QueueClearance script
    // Use date-only string for start, and date+time for end
    const startDateStr = `${year}-${month}-${day}`; // "2026-01-03"
    const endDateStr = `${year}-${month}-${day}T23:59:59`; // "2026-01-03T23:59:59"

    // Query only specified facility, or all facilities if not specified
    const facilityIdsToQuery = facilityId ? [facilityId] : FACILITY_IDS;

    console.log(`Querying ${facilityIdsToQuery.length} facility(ies) for date range: ${startDateStr} to ${endDateStr}`);

    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const fid of facilityIdsToQuery) {
      console.log(`  Querying facility: ${fid}...`);

      const facilitySnapshot = await db
        .collection(COLLECTION_PATH)
        .where('assigned_to.facility_id', '==', fid)
        .where('auth_on_file.created_at', '>=', startDateStr)
        .where('auth_on_file.created_at', '<=', endDateStr)
        .get();

      console.log(`    Found ${facilitySnapshot.size} orders`);
      allDocs.push(...facilitySnapshot.docs);
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
    console.error('Error fetching orders from Firebase (gcloud):', error);
    throw error;
  }
}

/**
 * Transform Firebase order to standardized format with IST timestamps
 */
export function transformFirebaseOrderGcloud(order: FirebaseOrder): any {
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
