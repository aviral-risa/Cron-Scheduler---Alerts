/**
 * Test Google Sheet Configuration
 */

export const TEST_SHEET_CONFIG = {
  // Test sheet ID (different from production)
  SHEET_ID: process.env.TEST_GOOGLE_SHEETS_ID || '1BcN9RJspVsTDXgxCGRX4dSYRvHwbUpkyfNziY8PD0O0',

  // Sheet names (same as production for compatibility)
  SHEET_NAMES: {
    RAW_HOURLY: 'orders_raw_hourly',
    ORG_METRICS: 'org_hourly_metrics',
    PERSON_METRICS: 'person_hourly_performance',
    WORKING_DAYS: 'config_working_days',
    DAILY_SUMMARY: 'daily_summary',
    SYNC_LOG: 'config_sync_log',
  },
};

/**
 * Organizations to test (from production config)
 */
export interface Organization {
  id: string;
  name: string;
  facilityId: string;
  teamSize: number;
  expectedDailyOrders: number;
}

export const ORGANIZATIONS: Organization[] = [
  {
    id: 'nycbs',
    name: 'NYCBS',
    facilityId: 'HhwIHO4npKhrxyylkC33',
    teamSize: 22,
    expectedDailyOrders: 1200,
  },
  {
    id: 'chc',
    name: 'CHC',
    facilityId: '4BlQ4SsqAVTDgFKApKZr',
    teamSize: 8,
    expectedDailyOrders: 600,
  },
  {
    id: 'mbpcc',
    name: 'MBPCC',
    facilityId: '3GKbZtgpPru1vJGCkxwR',
    teamSize: 5,
    expectedDailyOrders: 400,
  },
  {
    id: 'ucbc',
    name: 'UCBC',
    facilityId: 'W14MolgUu7OYvX4CFQJn',
    teamSize: 4,
    expectedDailyOrders: 300,
  },
];

export function getOrganizationByFacilityId(facilityId: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.facilityId === facilityId);
}
