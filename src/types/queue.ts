/**
 * Queue Data Types
 */

export interface PersonQueueSnapshot {
  snapshot_timestamp: string;
  snapshot_date: string;
  snapshot_hour: string;
  person_name: string;
  person_id: string;
  facility_id: string;
  new: number;
  pending: number;
  query: number;
  hold: number;
  auth_required: number;
  total_open_orders: number;
}
