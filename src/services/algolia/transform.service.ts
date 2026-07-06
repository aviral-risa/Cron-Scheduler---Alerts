/**
 * Algolia Data Transformation Service (Production)
 *
 * Transforms Algolia order objects to OrderSnapshot format for backward compatibility
 */

import type { AlgoliaOrder } from './fetch.service';
import type { OrderSnapshot } from '../../types/orders';
import { toISTTimestamp, toISTHour, toISTTimestampOrEmpty } from '../../utils/timezone';

class AlgoliaTransformService {
  /**
   * Transform a single Algolia order to OrderSnapshot format
   */
  transformOrder(algoliaOrder: AlgoliaOrder): OrderSnapshot {
    // Extract provider name and determine assignment status
    const providerName = algoliaOrder.assigned_to_name;
    const isAssigned = !!providerName && providerName.toLowerCase() !== 'unassigned';
    const isWorked = !!algoliaOrder.date_of_work_iso;

    // Current time for snapshot fields (IST)
    const currentTime = new Date();

    // Convert Algolia ISO timestamps to IST
    const createdAtIST = toISTTimestampOrEmpty(algoliaOrder.created_at_iso);
    const createdAtDate = createdAtIST ? createdAtIST.split(' ')[0] : '';

    return {
      snapshot_timestamp: toISTTimestamp(currentTime),
      snapshot_hour_ist: String(toISTHour(currentTime)),
      order_id: algoliaOrder.objectID || algoliaOrder.id || algoliaOrder.order_id || '',
      facility_id: algoliaOrder.org_id || '',
      provider_name: isAssigned ? providerName : null,
      master_auth_status: algoliaOrder.master_auth_status || 'unknown',
      created_at: createdAtIST,
      created_at_date: createdAtDate,
      assigned_at: toISTTimestampOrEmpty(algoliaOrder.assigned_at_iso),
      date_of_work: toISTTimestampOrEmpty(algoliaOrder.date_of_work_iso),
      is_assigned: isAssigned,
      is_worked: isWorked,
    };
  }

  /**
   * Transform an array of Algolia orders to OrderSnapshot format
   */
  transformOrders(algoliaOrders: AlgoliaOrder[]): OrderSnapshot[] {
    const snapshots: OrderSnapshot[] = [];
    const errors: { index: number; error: string }[] = [];

    algoliaOrders.forEach((order, index) => {
      try {
        const snapshot = this.transformOrder(order);
        snapshots.push(snapshot);
      } catch (error: any) {
        errors.push({
          index,
          error: error.message || String(error),
        });
        console.error(`[Algolia Transform] Failed to transform order ${index}:`, error.message);
      }
    });

    if (errors.length > 0) {
      console.warn(`[Algolia Transform] Failed to transform ${errors.length}/${algoliaOrders.length} orders`);
    }

    return snapshots;
  }
}

// Export singleton instance
export const algoliaTransformService = new AlgoliaTransformService();
