/**
 * Browser-compatible Firestore data fetching
 * Uses Firestore Web SDK instead of Admin SDK
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import type { FirebaseOrder } from '../types/orders';

// Initialize Firestore Web SDK
let firestoreDb: ReturnType<typeof getFirestore> | null = null;

function getFirestoreDb() {
  if (!firestoreDb) {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const app = initializeApp(firebaseConfig, 'firestore-app');
    firestoreDb = getFirestore(app);
  }
  return firestoreDb;
}

const COLLECTION_PATH = import.meta.env.VITE_FIRESTORE_COLLECTION || 'medical_pa_orders';

/**
 * Fetch orders for a specific date and facility from Firestore
 */
export async function fetchOrdersByDateBrowser(
  date: Date,
  facilityId: string
): Promise<FirebaseOrder[]> {
  try {
    const db = getFirestoreDb();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const startDateStr = `${year}-${month}-${day}`;
    const endDateStr = `${year}-${month}-${day}T23:59:59`;

    console.log(`[Firestore Browser] Querying orders for facility ${facilityId} on ${startDateStr}...`);

    const ordersRef = collection(db, COLLECTION_PATH);
    const q = query(
      ordersRef,
      where('assigned_to.facility_id', '==', facilityId),
      where('timestamps.created_at', '>=', startDateStr),
      where('timestamps.created_at', '<=', endDateStr)
    );

    const querySnapshot = await getDocs(q);

    const orders: FirebaseOrder[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        assigned_to: data.assigned_to || {},
        status: data.status || {},
        timestamps: {
          created_at: data.timestamps?.created_at || '',
          assigned_at: data.timestamps?.assigned_at || null,
          date_of_work: data.timestamps?.date_of_work || null,
        },
        payload: data.payload || {},
      } as FirebaseOrder);
    });

    console.log(`[Firestore Browser] Found ${orders.length} orders for ${facilityId} on ${startDateStr}`);
    return orders;
  } catch (error: any) {
    console.error('[Firestore Browser] Error fetching orders:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}
