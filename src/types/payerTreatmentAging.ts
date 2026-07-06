export interface PayerTreatmentAgingRow {
  created_at_date: string;        // YYYY-MM-DD
  facility_id: string;            // Organization
  payer_name: string;             // primary_payer_name from unique orders
  total_orders_loaded: number;    // Order count + additional BO count
  total_orders_billed: number;    // completed + in_progress - non_billable + additional_bo_count
  loaded_0_to_7: number;          // Loaded in 0-7 biz days bucket (with BO adj)
  loaded_8_to_14: number;         // Loaded in 8-14 biz days bucket (with BO adj)
  loaded_15_to_21: number;        // Loaded in 15-21 biz days bucket (with BO adj)
  loaded_21_plus: number;         // Loaded in 21+ biz days bucket (with BO adj)
  billed_0_to_7: number;          // Billed in 0-7 biz days bucket
  billed_8_to_14: number;         // Billed in 8-14 biz days bucket
  billed_15_to_21: number;        // Billed in 15-21 biz days bucket
  billed_21_plus: number;         // Billed in 21+ biz days bucket
  last_updated_timestamp: string; // IST timestamp
}

export interface PayerTreatmentAgingData {
  rows: PayerTreatmentAgingRow[];
  computedAt: string;
}

export interface PayerTreatmentAgingFilters {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  organizationIds: string[];
}

export interface PayerTreatmentAgingResponse {
  success: boolean;
  data?: PayerTreatmentAgingData;
  error?: string;
}
