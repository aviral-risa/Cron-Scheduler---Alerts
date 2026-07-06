export interface DosCoverageRow {
  date: string;           // created_at_date YYYY-MM-DD
  totalOrders: number;
  bucket0to7: number;     // DoS within 0-7 business days
  bucket8to14: number;
  bucket15to21: number;
  bucket21plus: number;
  ordersWorked: number;   // total worked (should match Daily Performance)
  worked0to7: number;     // worked in that bucket
  worked8to14: number;
  worked15to21: number;
  worked21plus: number;
}

export interface DosCoverageData {
  rows: DosCoverageRow[];
  computedAt: string;
}

export interface DosCoverageFilters {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  organizationIds: string[];
}

export interface DosCoverageResponse {
  success: boolean;
  data?: DosCoverageData;
  error?: string;
}
