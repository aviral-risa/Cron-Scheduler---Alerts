/**
 * Business View Type Definitions
 * Types for the organization-level business analytics view
 */

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface BusinessViewFilters {
  organizationIds: string[];  // Array of facility IDs, empty = all orgs
  dateRange: DateRange;
  includeWeekends: boolean;
}

export interface BusinessMetrics {
  // Volume metrics
  totalOrdersLoaded: number;
  totalOrdersAssigned: number;
  totalOrdersWorked: number;
  totalOrdersCompleted: number;

  // Status breakdown
  authByRisa: number;
  authOnFile: number;
  noAuthRequired: number;
  denialByRisa: number;
  denialAfterQuery: number;
  existingDenial: number;
  query: number;
  pending: number;
  hold: number;
  authRequired: number;
  other: number;

  // Calculated metrics
  approvalRate: number | null;      // (Auth by Risa) / (Auth + Denial by Risa)
  authorizationRate: number | null; // (Total Authorized) / (Total Orders)

  // Trend data
  last5DaysCounts: DailyCount[];    // Last 5 working days
  last7DayAvg: number;

  // Metadata
  workingDaysCount: number;
  totalDaysCount: number;
  dateRange: DateRange;
  organizationIds: string[];

  // NEW: Monitoring tables data (optional - included when requested)
  monitoringTables?: MonitoringTablesData;
}

export interface DailyCount {
  date: string;              // YYYY-MM-DD
  ordersWorked: number;
  ordersLoaded: number;
  isWorkingDay: boolean;
}

export interface OrgBusinessMetrics {
  facilityId: string;
  orgName: string;
  totalOrdersLoaded: number;
  totalOrdersWorked: number;
  approvalRate: number | null;
  authorizationRate: number | null;
  activeProviderCount: number;
  ordersPerPerson: number | null;
  sevenDayAvg: number;
  varianceFromAvg: number | null;
  variancePercentage: number | null;
  performanceStatus: 'above' | 'normal' | 'below';
}

export interface StatusBreakdown {
  sumOfStatuses: number;
  totalOrdersWorked: number;
  validationMatch: boolean;
  discrepancy: number;
}

export interface DailyBusinessMetrics {
  date: string;
  ordersLoaded: number;
  ordersWorked: number;
  authByRisa?: number;
  authOnFile?: number;
  noAuthRequired?: number;
  denialByRisa?: number;
  denialAfterQuery?: number;
  approvalRate: number | null;
  authorizationRate: number | null;
  isWorkingDay: boolean;
  activeProviderCount: number;
  ordersPerPerson: number | null;
  // Open orders statuses (worked but not yet authorized/denied)
  authRequired?: number;
  pending?: number;
  hold?: number;
  query?: number;
  sevenDayRollingAvg: number;
  varianceFromAvg: number | null;
  variancePercentage: number | null;
  performanceStatus: 'above' | 'normal' | 'below';
}

// ====================================================================
// Monitoring Tables Types (for 4 new comprehensive monitoring tables)
// ====================================================================

/**
 * Orders Funnel Table - Daily progression tracking
 */
export interface OrdersFunnelDay {
  date: string;
  ordersLoaded: number;
  ordersAssigned: number;
  ordersCompleted: number;
  pctAssignedOfLoaded: number | null;      // % Orders Assigned of Orders Loaded
  pctCompletedOfAssigned: number | null;   // % Orders Completed of Assigned
  pctCompletedOfLoaded: number | null;     // % Orders Completed of Today's Order
  pctInProgressOfLoaded: number | null;    // % Orders In-Progress of Today's Order
}

export interface OrdersFunnelSummary {
  dailyBreakdown: OrdersFunnelDay[];
  l7dAvg: OrdersFunnelDay;   // 7-day average row
  l30dAvg: OrdersFunnelDay;  // 30-day average row
}

/**
 * Auth Status Breakdown Table - Percentage distribution by status
 */
export interface AuthStatusBreakdownDay {
  date: string;
  authByRisaPct: number | null;          // Auth by RISA (%)
  noAuthRequiredPct: number | null;      // No Auth Required (%)
  authOnFilePct: number | null;          // Auth on File (%)
  denialByRisaPct: number | null;        // Denial by RISA (%)
  deniedAfterQueryPct: number | null;    // Denied After Query (%)
  existingDenialPct: number | null;      // Existing Denial (%)
  inProgressPct: number | null;          // Pending/Hold/Query/Auth Required (%)
  restPct: number | null;                // Rest (%)
  total: number;                         // Total completed orders
  totalPct: number;                      // Should be 100%
}

export interface AuthStatusBreakdownSummary {
  dailyBreakdown: AuthStatusBreakdownDay[];
  l7dAvg: AuthStatusBreakdownDay;
  l30dAvg: AuthStatusBreakdownDay;
}

/**
 * Denial Tracking Table - Track denials trending toward zero
 */
export interface DenialTrackingDay {
  date: string;
  totalDenials: number;
  denialByRisa: number;
  deniedAfterQuery: number;
  existingDenial: number;
}

export interface DenialTrackingSummary {
  dailyBreakdown: DenialTrackingDay[];
}

/**
 * Order Accuracy Metrics Table - Daily and weekly rates
 */
export interface OrderAccuracyDay {
  date: string;
  authorizationRate: number | null;  // (Auth by RISA + NAR + Auth on File) / Total * 100
  approvalRate: number | null;       // Auth by RISA / (Auth + Denial by RISA) * 100
}

export interface OrderAccuracyWeek {
  weekLabel: string;  // "W1", "W2", "W3", "W4"
  weekStartDate: string;
  weekEndDate: string;
  authorizationRate: number | null;
  approvalRate: number | null;
}

export interface OrderAccuracyMetrics {
  dailyView: OrderAccuracyDay[];
  weeklyView: OrderAccuracyWeek[];
}

/**
 * Main container for all monitoring tables data
 */
export interface MonitoringTablesData {
  ordersFunnel: OrdersFunnelSummary;
  authStatusBreakdown: AuthStatusBreakdownSummary;
  denialTracking: DenialTrackingSummary;
  orderAccuracy: OrderAccuracyMetrics;
}
