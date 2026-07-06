import type { DateRange } from './business';
import type { BillingDataset } from '../config/billing-sources.config';

export interface BillingAnalyticsFilters {
  facilityId: string;
  dateRange: DateRange;
  dataset?: BillingDataset;
}

export interface BillingDataRow {
  date_of_work: string | null;
  mrn: string | null;
  patient_name: string | null;
  dob: string | null;
  md: string | null;
  primary_insurance: string | null;
  id: string | null;
  regimen: string | null;
  auth_status: string | null;
  bo_value: string | null;
  date_of_service: string | null;
  location: string | null;
  denial_comments: string | null;
  auth_issue_comments: string | null;
  status_tracking_rpa: string | null;
  // Extended fields (may not be present in all tables)
  cpt_code?: string | null;
  icd_10?: string | null;
  org_id?: string | null;
  bo_count?: number | null;
  order_creation_date?: string | null;
  provider_npi?: string | null;
}

export interface BillingMetrics {
  totalBillable: number;
  firstApprovalCount: number;
  firstApprovalRate: number;
  queryRaisedCount: number;
  queryRaisedPct: number;
  denialCount: number;
  denialPct: number;
}

export interface BillingAnalyticsResponse {
  rows: BillingDataRow[];
  metrics: BillingMetrics;
  totalRawCount: number;
  dataset: string;
  table: string;
  query: {
    startDate: string;
    endDate: string;
    facilityId: string;
  };
}

export interface BillingClient {
  orgId: string;
  orgName: string;
  facilityId: string;
  dataset: string;
  availableDatasets: string[];
}
