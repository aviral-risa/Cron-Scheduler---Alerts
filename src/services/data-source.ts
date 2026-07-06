/**
 * Data Source Abstraction Layer
 *
 * Provides unified interface for fetching orders from either Algolia or Firestore
 * based on configuration, with automatic fallback support.
 */

import { algoliaFetchService, type AlgoliaOrder } from './algolia/fetch.service';
import { algoliaTransformService } from './algolia/transform.service';
import { useAlgolia, useFirestore, DATA_SOURCE_CONFIG, logDataSourceConfig } from '../config/data-source.config';
import type { OrderSnapshot } from '../types/orders';

export interface FetchResult {
  snapshots: OrderSnapshot[];
  algoliaOrders?: AlgoliaOrder[]; // Only present when using Algolia
}

/**
 * Fetch orders for a date using the configured data source
 * Returns both OrderSnapshots and raw AlgoliaOrders (when using Algolia)
 * Automatically falls back to Firestore if Algolia fails and fallback is enabled
 */
export async function fetchOrdersByDate(date: Date, facilityId: string): Promise<FetchResult> {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Use Algolia if configured
  if (useAlgolia()) {
    try {
      console.log(`[Data Source] Using Algolia for ${facilityId} on ${dateStr}`);

      const algoliaOrders = await algoliaFetchService.fetchOrdersByDate(facilityId, dateStr);
      const snapshots = algoliaTransformService.transformOrders(algoliaOrders);

      console.log(`[Data Source] ✓ Fetched ${snapshots.length} orders from Algolia`);
      return { snapshots, algoliaOrders };

    } catch (error: any) {
      console.error(`[Data Source] Algolia fetch failed:`, error.message);

      // Fallback to Firestore if enabled
      if (DATA_SOURCE_CONFIG.enableFirestoreFallback) {
        console.warn(`[Data Source] Falling back to Firestore...`);
        const snapshots = await fetchFromFirestoreWithTransform(date, facilityId);
        return { snapshots }; // No algoliaOrders when using Firestore
      } else {
        throw error;
      }
    }
  }

  // Use Firestore if configured
  if (useFirestore()) {
    console.log(`[Data Source] Using Firestore for ${facilityId} on ${dateStr}`);
    const snapshots = await fetchFromFirestoreWithTransform(date, facilityId);
    return { snapshots };
  }

  throw new Error(`Invalid data source configuration: ${DATA_SOURCE_CONFIG.orderDataSource}`);
}

/**
 * Helper: Fetch from Firestore and transform to OrderSnapshot
 * Uses dynamic import to avoid bundling firebase-admin in browser builds
 */
async function fetchFromFirestoreWithTransform(date: Date, facilityId: string): Promise<OrderSnapshot[]> {
  // Dynamic import to avoid bundling Node.js-only firebase-admin in browser
  const { fetchOrdersByDate: fetchFromFirestore, transformFirebaseOrder } = await import('./firebase');

  const orders = await fetchFromFirestore(date, facilityId);
  const snapshots = orders.map((order) => transformFirebaseOrder(order));

  console.log(`[Data Source] ✓ Fetched ${snapshots.length} orders from Firestore`);
  return snapshots;
}

/**
 * Log current data source configuration (call at startup)
 */
export function logCurrentDataSource(): void {
  logDataSourceConfig();
}
