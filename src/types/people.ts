/**
 * People View Type Definitions
 * Types for person-level performance tracking and reporting
 */

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface PeopleViewFilters {
  personId: string | null;           // Team member ID (single select)
  dateRange: DateRange;
  includeWeekends: boolean;          // Filter weekends toggle
}

export interface StatusBreakdown {
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
}

export interface PersonPerformanceSummary {
  personName: string;
  personId: string;
  organization: string;                // Primary org (from team-members config)

  // Volume metrics
  totalOrdersCreated: number;          // Orders created in date range
  totalOrdersAssigned: number;         // Orders assigned to person
  totalOrdersCompleted: number;        // Orders completed by person

  // Completion metrics
  completionRate: number | null;       // (completed / assigned) * 100

  // Quality metrics
  approvalRate: number | null;         // (auth_by_risa / (auth + denial by risa)) * 100
  authorizationRate: number | null;    // (all auth / (auth + denial)) * 100

  // Status breakdown
  statusBreakdown: StatusBreakdown;

  // Time metrics
  totalHoursWorked: number;            // Sum of daily hours (logoff - login)
  avgHoursPerDay: number;              // Average hours per working day

  // Metadata
  dateRange: DateRange;
  workingDaysCount: number;
}

export interface DailyPersonPerformance {
  date: string;                        // YYYY-MM-DD
  dayOfWeek: string;                   // "Mon", "Tue", etc.
  isWorkingDay: boolean;

  // Organizations worked
  organizations: string[];             // May work in multiple orgs in one day

  // Volume metrics
  ordersAssigned: number;
  ordersWorked: number;
  ordersNotWorked: number;

  // Completion rate
  completionRate: number | null;       // (worked / assigned) * 100

  // Status breakdown for the day
  statusBreakdown: StatusBreakdown;

  // Time metrics
  loginTime: string | null;            // HH:MM IST
  logoffTime: string | null;           // HH:MM IST
  hoursWorked: number | null;          // Calculated from login/logoff

  // Performance indicator
  performanceStatus: 'above' | 'on_pace' | 'below';
  paceVsAvg: number;                   // From person_hourly_performance
}
