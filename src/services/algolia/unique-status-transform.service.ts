/**
 * Unique Order Status Transformation Service
 *
 * Transforms Algolia orders into UniqueOrderStatus format with:
 * - Hash-based change detection for all tracked fields
 * - Specific auth_status change tracking with transition history
 */

import type { AlgoliaOrder } from './fetch.service';
import type { UniqueOrderStatus } from '../../types/orders';
import { generateHash } from '../../utils/crypto';

/**
 * Extracts and transforms 29 tracked fields from Algolia order
 */
export function transformAlgoliaToUniqueStatus(
  algoliaOrder: AlgoliaOrder,
  syncTimestamp: string,
  existingOrder?: UniqueOrderStatus
): UniqueOrderStatus {
  // Extract 29 tracked fields
  const trackedFields = {
    created_at_iso: algoliaOrder.created_at_iso || '',
    indexed_at_iso: algoliaOrder.indexed_at_iso || '',
    assigned_to_name: algoliaOrder.assigned_to_name || null,
    primary_payer_name: algoliaOrder.primary_payer_name || null,
    regimen_name: algoliaOrder.regimen_name || null,
    date_of_service_iso: algoliaOrder.date_of_service_iso || null,
    org_id: algoliaOrder.org_id || '',
    primary_active: algoliaOrder.primary_active || null,
    ev_bv_primary: algoliaOrder.ev_bv_primary || null,
    document_upload_status: algoliaOrder.document_upload_status || null,
    ev_write_back_status: algoliaOrder.ev_write_back_status || null,
    bo_status: algoliaOrder.bo_status || null,
    master_auth_status: algoliaOrder.master_auth_status || '',
    mark_as_completed: algoliaOrder.mark_as_completed ?? null,
    auth_on_file_status: algoliaOrder.auth_on_file_status || null,
    auth_on_file_updated_at: algoliaOrder.auth_on_file_updated_at || null,
    auth_status: algoliaOrder.auth_status || null,
    medical_order_status: algoliaOrder.medical_order_status || null,
    regimen_type: algoliaOrder.regimen_type || null,
    auth_on_file_error_type: algoliaOrder.auth_on_file_error_type || null,
    auth_on_file_error_message: algoliaOrder.auth_on_file_error_message || null,
    nar_check_status: algoliaOrder.nar_check_status || null,
    date_of_work_iso: algoliaOrder.date_of_work_iso || null,
    assigned_at_iso: algoliaOrder.assigned_at_iso || null,
    health_first_nar_rpa_status: algoliaOrder.health_first_nar_rpa_status || null,
    submission: algoliaOrder.submission || null,
    fax_submission_status: algoliaOrder.fax_submission_status || null,
    medical_order_review_status: algoliaOrder.medical_order_review_status || null,
  };

  // Generate hash of all tracked fields
  const fieldsHash = generateHash(trackedFields);

  // Check if any field has changed
  const hasFieldsChanged = !existingOrder || existingOrder.fields_hash !== fieldsHash;

  // Check if auth_status specifically has changed
  const newAuthStatus = algoliaOrder.auth_status || null;
  const existingAuthStatus = existingOrder?.auth_status || null;
  const hasAuthStatusChanged = newAuthStatus !== existingAuthStatus;

  // Calculate auth_status change tracking metadata
  const authStatusEverChanged = existingOrder
    ? existingOrder.auth_status_ever_changed || hasAuthStatusChanged
    : false;

  const authStatusChangeCount = existingOrder
    ? hasAuthStatusChanged
      ? existingOrder.auth_status_change_count + 1
      : existingOrder.auth_status_change_count
    : 0;

  const authStatusLastChangeFrom = hasAuthStatusChanged
    ? existingAuthStatus
    : existingOrder?.auth_status_last_change_from || null;

  const authStatusLastChangeTo = hasAuthStatusChanged
    ? newAuthStatus
    : existingOrder?.auth_status_last_change_to || null;

  const authStatusLastChangedAt = hasAuthStatusChanged
    ? syncTimestamp
    : existingOrder?.auth_status_last_changed_at || null;

  return {
    order_id: algoliaOrder.id || algoliaOrder.order_id,
    ...trackedFields,

    // General change tracking metadata
    fields_hash: fieldsHash,
    first_synced_at: existingOrder?.first_synced_at || syncTimestamp,
    last_synced_at: syncTimestamp,
    last_changed_at: hasFieldsChanged
      ? syncTimestamp
      : existingOrder?.last_changed_at || syncTimestamp,
    sync_count: (existingOrder?.sync_count || 0) + 1,
    change_count: hasFieldsChanged
      ? (existingOrder?.change_count || 0) + 1
      : existingOrder?.change_count || 0,

    // Auth status specific change tracking
    auth_status_ever_changed: authStatusEverChanged,
    auth_status_change_count: authStatusChangeCount,
    auth_status_last_change_from: authStatusLastChangeFrom,
    auth_status_last_change_to: authStatusLastChangeTo,
    auth_status_last_changed_at: authStatusLastChangedAt,

    // Patient MRN (not part of tracked fields hash) - stored as patient_id in Algolia
    patient_mrn: algoliaOrder.patient_id || null,

    // Duplicate detection (set by detect-duplicates script, preserved from existing)
    is_duplicate: existingOrder?.is_duplicate || false,
  };
}

/**
 * Detects changes between new orders and existing orders
 * Returns categorized lists for efficient batch operations
 */
export function detectChanges(
  newOrders: UniqueOrderStatus[],
  existingMap: Map<string, UniqueOrderStatus>
): {
  inserts: UniqueOrderStatus[];
  updates: UniqueOrderStatus[];
  unchanged: UniqueOrderStatus[];
} {
  const inserts: UniqueOrderStatus[] = [];
  const updates: UniqueOrderStatus[] = [];
  const unchanged: UniqueOrderStatus[] = [];

  for (const order of newOrders) {
    const existing = existingMap.get(order.order_id);

    if (!existing) {
      // New order - insert
      inserts.push(order);
    } else if (existing.fields_hash !== order.fields_hash) {
      // Fields changed - update
      updates.push(order);
    } else {
      // No changes - only update sync metadata
      unchanged.push({
        ...order,
        sync_count: existing.sync_count + 1,
        last_synced_at: order.last_synced_at,
      });
    }
  }

  return { inserts, updates, unchanged };
}
