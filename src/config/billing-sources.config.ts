/**
 * Billing Analytics — per-client BigQuery source configuration
 *
 * Each client maps to a BigQuery dataset + table (table name = facility ID).
 * Two datasets exist:
 *   - medical_pa_final_worklist: manually uploaded, vetted data
 *   - external_dashboard: automated data flow
 */

export type BillingDataset = 'medical_pa_final_worklist' | 'external_dashboard';

export interface BillingClientConfig {
  orgId: string;
  dataset: BillingDataset;
  table: string; // = facility ID
  enabled: boolean;
  /** Which datasets this client exists in (for toggle UI) */
  availableDatasets: BillingDataset[];
}

// ---------------------------------------------------------------------------
// Per-client configs
// ---------------------------------------------------------------------------

export const BILLING_CLIENT_CONFIGS: BillingClientConfig[] = [
  {
    orgId: 'nycbs',
    dataset: 'medical_pa_final_worklist',
    table: 'HhwIHO4npKhrxyylkC33',
    enabled: true,
    availableDatasets: ['medical_pa_final_worklist', 'external_dashboard'],
  },
  {
    orgId: 'chc',
    dataset: 'medical_pa_final_worklist',
    table: '4BlQ4SsqAVTDgFKApKZr',
    enabled: true,
    availableDatasets: ['medical_pa_final_worklist', 'external_dashboard'],
  },
  {
    orgId: 'mbpcc',
    dataset: 'medical_pa_final_worklist',
    table: '3GKbZtgpPru1vJGCkxwR',
    enabled: true,
    availableDatasets: ['medical_pa_final_worklist', 'external_dashboard'],
  },
  {
    orgId: 'ucbc',
    dataset: 'medical_pa_final_worklist',
    table: 'W14MolgUu7OYvX4CFQJn',
    enabled: true,
    availableDatasets: ['medical_pa_final_worklist', 'external_dashboard'],
  },
  {
    orgId: 'sunstate',
    dataset: 'external_dashboard',
    table: 'sfmlrFGXYg3aBMdTs4od',
    enabled: true,
    availableDatasets: ['external_dashboard'],
  },
  {
    // Unidentified 6th table — disabled until org is confirmed
    orgId: 'unknown_Y15e',
    dataset: 'external_dashboard',
    table: 'Y15ePfa5kC35QiChxXil',
    enabled: false,
    availableDatasets: ['external_dashboard'],
  },
];

/** Global toggle: override ALL clients to use this dataset (null = use per-client default) */
export const BILLING_DATASET_OVERRIDE: BillingDataset | null = null;

// ---------------------------------------------------------------------------
// Auth status classification — per dataset naming convention
// ---------------------------------------------------------------------------

/** Statuses to EXCLUDE (non-billable) — medical_pa_final_worklist (human-readable) */
export const EXCLUDED_STATUSES_MANUAL: string[] = [
  'Oral Drug',
  'Not to work/Oral drug',
  'pcp',
  'urology',
  'Not to work/Urology',
  'Not applicable',
  'Not available',
  'Not to work',
  'Worked by Fedora team',
  'OBGYN',
  'Not to work/Stat case',
];

/** Statuses to EXCLUDE (non-billable) — external_dashboard (snake_case) */
export const EXCLUDED_STATUSES_EXTERNAL: string[] = [
  'oral_drug',
  'not_to_work_oral_drug',
  'pcp',
  'urology',
  'not_applicable',
  'not_available',
  'not_to_work_stale',
  'not_to_work_fedora',
  'not_to_work_stat',
];

/** First-submission approval statuses — medical_pa_final_worklist */
export const FIRST_APPROVAL_STATUSES_MANUAL: string[] = [
  'Auth on file',
  'NAR',
  'POD',
  'Auth by RISA',
];

/** First-submission approval statuses — external_dashboard */
export const FIRST_APPROVAL_STATUSES_EXTERNAL: string[] = [
  'auth_on_file',
  'no_auth_required',
  'patient_owned_drug',
  'auth_by_risa',
];

/** Query-raised statuses — medical_pa_final_worklist */
export const QUERY_STATUSES_MANUAL: string[] = [
  'Query',
  'query',
];

/** Query-raised statuses — external_dashboard */
export const QUERY_STATUSES_EXTERNAL: string[] = [
  'query',
  'dos_passed_after_query',
  'onsite_worked_after_query',
  'denial_after_query',
];

/** Denial statuses — medical_pa_final_worklist */
export const DENIAL_STATUSES_MANUAL: string[] = [
  'Existing denial',
  'Denied by RISA',
  'Denial by RISA',
];

/** Denial statuses — external_dashboard */
export const DENIAL_STATUSES_EXTERNAL: string[] = [
  'existing_denial',
  'denied_by_risa',
  'denial_after_query',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getBillingConfig(orgId: string): BillingClientConfig | undefined {
  return BILLING_CLIENT_CONFIGS.find((c) => c.orgId === orgId && c.enabled);
}

export function getBillingConfigByFacilityId(facilityId: string): BillingClientConfig | undefined {
  return BILLING_CLIENT_CONFIGS.find((c) => c.table === facilityId && c.enabled);
}

export function getEffectiveDataset(config: BillingClientConfig): BillingDataset {
  return BILLING_DATASET_OVERRIDE ?? config.dataset;
}

export function getExcludedStatuses(dataset: BillingDataset): string[] {
  return dataset === 'medical_pa_final_worklist'
    ? EXCLUDED_STATUSES_MANUAL
    : EXCLUDED_STATUSES_EXTERNAL;
}

export function getFirstApprovalStatuses(dataset: BillingDataset): string[] {
  return dataset === 'medical_pa_final_worklist'
    ? FIRST_APPROVAL_STATUSES_MANUAL
    : FIRST_APPROVAL_STATUSES_EXTERNAL;
}

export function getQueryStatuses(dataset: BillingDataset): string[] {
  return dataset === 'medical_pa_final_worklist'
    ? QUERY_STATUSES_MANUAL
    : QUERY_STATUSES_EXTERNAL;
}

export function getDenialStatuses(dataset: BillingDataset): string[] {
  return dataset === 'medical_pa_final_worklist'
    ? DENIAL_STATUSES_MANUAL
    : DENIAL_STATUSES_EXTERNAL;
}
