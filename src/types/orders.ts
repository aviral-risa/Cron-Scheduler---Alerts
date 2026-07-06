export interface FirebaseOrder {
  id: string;
  assigned_to: {
    facility_id: string;
    provider_id: string;
    provider_name: string;
  };
  status: {
    master_auth_status: string;
  };
  timestamps: {
    created_at: string;
    assigned_at: string | null;
    date_of_work: string | null;
  };
  payload?: {
    date_of_service?: string;
  };
}

export interface OrderSnapshot {
  snapshot_timestamp: string; // Current time when script runs (IST)
  snapshot_hour_ist: string; // Hour from snapshot_timestamp as string (e.g., "20" for 8 PM IST)
  order_id: string;
  facility_id: string;
  provider_name: string | null;
  master_auth_status: string;
  created_at: string; // Full timestamp when order was created (IST)
  created_at_date: string; // Date extracted from created_at (IST)
  assigned_at: string | null;
  date_of_work: string | null;
  is_assigned: boolean;
  is_worked: boolean;
}

export interface OrgMetrics {
  snapshot_timestamp: string; // When sync was run (IST format: "2026-01-04 14:16:14")
  snapshot_hour_ist: string; // Hour when sync was run (IST hour as string: "0"-"23")
  created_at_date: string; // Date of orders being synced (IST date: "2026-01-03")
  facility_id: string;
  orders_loaded_today: number;
  orders_assigned: number;
  orders_worked: number;
  orders_not_worked_assigned: number;
  work_rate_pct: number;
  avg_worked_last_7_working_days: number;
  pace_vs_avg: number;
  pace_status: 'AHEAD' | 'ON_PACE' | 'BEHIND';
  projected_eod_worked: number;
}

export interface PersonMetrics {
  snapshot_timestamp: string; // When sync was run (IST format: "2026-01-04 14:16:14")
  snapshot_hour_ist: string; // Hour when sync was run (IST hour as string: "0"-"23")
  created_at_date: string; // Date of orders being synced (IST date: "2026-01-03")
  facility_id: string;
  provider_name: string;
  assigned_count: number;
  worked_count: number;
  not_worked_count: number;
  avg_worked_last_7_working_days: number;
  person_pace_vs_avg: number;
  person_pace_status: 'AHEAD' | 'ON_PACE' | 'BEHIND';
  login_time: string | null; // First completion timestamp for the day (IST format)
  logoff_time: string | null; // Last completion timestamp for the day (IST format)
}

export interface WorkingDayConfig {
  date: string;
  is_working_day: boolean;
  day_type: string;
  notes: string;
}

export interface DailySummary {
  created_at_date: string; // Date of orders being summarized (IST date: "2026-01-03")
  facility_id: string; // Organization facility ID
  total_orders: number; // Total count of orders created on this date
  orders_assigned: number; // Count where is_assigned = true
  orders_completed: number; // Count where is_worked = true
  status_auth_by_risa: number; // Count where master_auth_status = 'auth_by_risa'
  status_auth_on_file: number; // Count where master_auth_status = 'auth_on_file'
  status_no_auth_required: number; // Count where master_auth_status = 'no_auth_required'
  status_denial_by_risa: number; // Count where master_auth_status = 'denial_by_risa'
  status_denial_after_query: number; // Count where master_auth_status = 'denial_after_query'
  status_existing_denial: number; // Count where master_auth_status = 'existing_denial'
  status_query: number; // Count where master_auth_status = 'query'
  status_pending: number; // Count where master_auth_status = 'pending'
  status_hold: number; // Count where master_auth_status = 'hold'
  status_auth_required: number; // Count where master_auth_status = 'auth_required'
  status_other: number; // Count of all other statuses (combined)
  last_updated_timestamp: string; // When this summary was calculated (IST format: "2026-01-04 14:16:14")
}

export interface UniqueOrderStatus {
  // Primary Key
  order_id: string;

  // 29 Tracked Fields from Algolia
  created_at_iso: string;
  indexed_at_iso: string;
  assigned_to_name: string | null;
  primary_payer_name: string | null;
  regimen_name: string | null;
  date_of_service_iso: string | null;
  org_id: string;
  primary_active: string | null;
  ev_bv_primary: string | null;
  document_upload_status: string | null;
  ev_write_back_status: string | null;
  bo_status: string | null;
  master_auth_status: string;
  mark_as_completed: boolean | null;
  auth_on_file_status: string | null;
  auth_on_file_updated_at: string | null;
  auth_status: string | null;
  medical_order_status: string | null;
  regimen_type: string | null;
  auth_on_file_error_type: string | null;
  auth_on_file_error_message: string | null;
  nar_check_status: string | null;
  date_of_work_iso: string | null;
  assigned_at_iso: string | null;
  health_first_nar_rpa_status: string | null;
  submission: string | null;
  fax_submission_status: string | null;
  medical_order_review_status: string | null;

  // General Metadata
  fields_hash: string;
  first_synced_at: string;
  last_synced_at: string;
  last_changed_at: string;
  sync_count: number;
  change_count: number;

  // Auth Status Change Tracking
  auth_status_ever_changed: boolean;
  auth_status_change_count: number;
  auth_status_last_change_from: string | null;
  auth_status_last_change_to: string | null;
  auth_status_last_changed_at: string | null;

  // BO Count (from Firestore)
  bo_count: number | null;

  // Patient MRN (from Algolia)
  patient_mrn: string | null;

  // Duplicate Detection
  is_duplicate: boolean;
}

export interface BusinessMetricsDaily {
  // Dimensions (2 columns)
  created_at_date: string; // Date of orders (IST date: "2026-01-03")
  facility_id: string; // Organization facility ID

  // Volume Metrics (5 columns)
  total_orders: number; // Total count of orders
  orders_assigned: number; // Count where assigned_to_name not null
  orders_completed: number; // Count where medical_order_status = 'Order Completed by Agent' or 'Order Completed by Human'
  orders_inprogress: number; // Count where medical_order_status = 'Order in progress'
  total_billable_orders: number; // completed + in_progress - non_billable + additional_bo_count

  // Status Distribution - auth_status for In Progress + Completed orders only (11 columns)
  status_auth_by_risa: number; // Count where auth_status = 'auth_by_risa' (in progress/completed only)
  status_auth_on_file: number; // Count where auth_status = 'auth_on_file' (in progress/completed only)
  status_no_auth_required: number; // Count where auth_status = 'no_auth_required' (in progress/completed only)
  status_denial_by_risa: number; // Count where auth_status = 'denial_by_risa' (in progress/completed only)
  status_denial_after_query: number; // Count where auth_status = 'denial_after_query' (in progress/completed only)
  status_existing_denial: number; // Count where auth_status = 'existing_denial' (in progress/completed only)
  status_query: number; // Count where auth_status = 'query' (in progress/completed only)
  status_pending: number; // Count where auth_status = 'pending' (in progress/completed only)
  status_hold: number; // Count where auth_status = 'hold' (in progress/completed only)
  status_auth_required: number; // Count where auth_status = 'auth_required' (in progress/completed only)
  status_other: number; // Count of all other statuses (combined, in progress/completed only)

  // Calculated Rates (4 columns)
  approval_rate_pct: number; // auth_by_risa / (auth_by_risa + denial_by_risa) × 100
  authorization_rate_pct: number; // (auth + aof + nar) / (auth + aof + nar + denial_by_risa + denial_after_query) × 100
  order_completion_pct: number; // orders_completed / total × 100
  order_inprogress_pct: number; // orders_inprogress / total × 100

  // Metadata (1 column)
  last_updated_timestamp: string; // When this summary was calculated (IST format)

  // Active Users Metric (1 column) - Added at end for easy backfilling
  distinct_users_worked: number; // Count of distinct assigned_to_name who worked (completed/in-progress), excluding RISA Agent
}
