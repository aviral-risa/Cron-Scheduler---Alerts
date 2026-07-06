/**
 * Algolia API Type Definitions
 *
 * These types represent the structure of data returned by the Algolia search API
 * for PA Order Creation medical orders.
 */

/**
 * Authentication token response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expiration_time: number; // seconds
}

/**
 * Algolia order object as returned by the search API
 * Contains all fields from the indexed medical order
 */
export interface AlgoliaOrder {
  // Core identifiers
  objectID: string;
  id: string;
  order_id: string;
  org_id: string;

  // Assignment information
  assigned_to: string;
  assigned_to_name: string;
  assigned_at?: number;
  assigned_at_iso?: string | null;

  // Status fields
  master_auth_status: string;
  auth_status?: string;
  medical_order_status?: string;
  auth_on_file_status?: string;
  bo_status?: string;
  document_upload_status?: string;
  ev_write_back_status?: string;
  ev_bv_primary?: string;
  financial_review?: string;
  nar_check_status?: string;
  order_creation?: string;
  primary_status?: string;

  // Timestamps
  created_at: number;
  created_at_iso: string;
  date_of_work?: number;
  date_of_work_iso?: string | null;
  indexed_at: number;
  indexed_at_iso: string;
  updated_at?: string;
  auth_on_file_updated_at?: string;

  // Patient information
  patient_id?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  patient_fhir_identifier?: string;

  // Provider/practitioner information
  practitioner_name?: string;

  // Treatment/regimen information
  regimen_name?: string;
  regimen_type?: string;
  service_type?: string;

  // Insurance/payer information
  primary_member_id?: string;
  primary_payer_name?: string;
  primary_active?: string;

  // Location
  location?: string;

  // Service date
  date_of_service?: number;
  date_of_service_iso?: string;

  // Flags
  mark_as_completed?: boolean;

  // Alerts
  alert_badges?: string[];
  alerts?: any[];

  // Errors
  auth_on_file_error_type?: string;
  auth_on_file_error_message?: string;

  // AI agent type
  ai_agent_type?: string;

  // Highlight results (from Algolia search)
  _highlightResult?: Record<string, any>;
}

/**
 * Algolia search response structure
 */
export interface AlgoliaSearchResponse {
  success: boolean;
  hits: AlgoliaOrder[];
  nb_hits: number;
  nb_pages: number;
  page: number;
  hits_per_page: number;
  processing_time_ms?: number;
  query?: string;
  params?: string;
  message?: string;
  error?: string | null;
}

/**
 * Algolia search request parameters
 */
export interface AlgoliaSearchRequest {
  org_id: string;
  hits_per_page: number;
  page: number;
  created_at_start: string; // Format: "YYYY-MM-DD"
  created_at_end: string; // Format: "YYYY-MM-DD"
}

/**
 * Validation result for a single order
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Aggregate validation statistics
 */
export interface ValidationStats {
  total_orders: number;
  total_assigned: number;
  total_worked: number;
  total_unassigned: number;
  field_validation_pass_rate: number;
  type_validation_pass_rate: number;
  format_validation_pass_rate: number;
  derived_logic_pass_rate: number;
  issues: string[];
}
