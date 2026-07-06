import admin from 'firebase-admin';
import type { FirebaseOrder } from '../types/orders';
import { FACILITY_IDS } from '../config/organizations';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return process.env[key];
};

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
      clientEmail: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      privateKey: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const COLLECTION_PATH = getEnv('VITE_FIRESTORE_COLLECTION') || 'medical_pa_orders';

/**
 * Fetch orders for a specific date using Admin SDK (bypasses security rules)
 */
export async function fetchOrdersByDateAdmin(date: Date): Promise<FirebaseOrder[]> {
  try {
    // Set start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    console.log(`Querying orders from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    const orders: FirebaseOrder[] = [];

    // Query each facility separately (Firestore 'in' query limit is 10, we have 4)
    for (const facilityId of FACILITY_IDS) {
      const snapshot = await db
        .collection(COLLECTION_PATH)
        .where('assigned_to.facility_id', '==', facilityId)
        .where('timestamps.created_at', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
        .where('timestamps.created_at', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
        .get();

      snapshot.forEach((doc) => {
        const data = doc.data();
        orders.push({
          id: doc.id,
          assigned_to: data.assigned_to || {},
          status: data.status || {},
          timestamps: {
            created_at: data.timestamps?.created_at?.toDate?.()?.toISOString() || data.timestamps?.created_at || '',
            assigned_at: data.timestamps?.assigned_at?.toDate?.()?.toISOString() || data.timestamps?.assigned_at || null,
            date_of_work: data.timestamps?.date_of_work?.toDate?.()?.toISOString() || data.timestamps?.date_of_work || null,
          },
          payload: data.payload || {},
        } as FirebaseOrder);
      });
    }

    console.log(`Fetched ${orders.length} orders for ${date.toISOString().split('T')[0]}`);
    return orders;
  } catch (error) {
    console.error('Error fetching orders from Firebase Admin:', error);
    throw error;
  }
}

/**
 * Transform Firebase order to standardized format
 */
export function transformFirebaseOrderAdmin(order: FirebaseOrder, snapshotTime: Date): any {
  const providerName = order.assigned_to?.provider_name;
  const isAssigned = providerName && providerName.toLowerCase() !== 'unassigned';
  const isWorked = !!order.timestamps?.date_of_work;

  return {
    snapshot_timestamp: snapshotTime.toISOString(),
    snapshot_date: snapshotTime.toISOString().split('T')[0],
    snapshot_hour: snapshotTime.getHours(),
    order_id: order.id,
    facility_id: order.assigned_to?.facility_id || '',
    provider_name: isAssigned ? providerName : null,
    master_auth_status: order.status?.master_auth_status || 'unknown',
    created_at: order.timestamps?.created_at || '',
    assigned_at: order.timestamps?.assigned_at || null,
    date_of_work: order.timestamps?.date_of_work || null,
    is_assigned: isAssigned,
    is_worked: isWorked,
  };
}
