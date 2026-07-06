/**
 * Billing Configuration
 *
 * Defines which auth_status values should be excluded from billable order counts
 */

export const NON_BILLABLE_AUTH_STATUSES = [
  'not_to_work_fedora',   // NYCBS: 63 orders (0.63%)
  'not_to_work_stat',     // NYCBS: 3 orders (0.03%)
  'worked_by_onsite',     // UCBC: 3 orders (0.03%)
] as const;

export type NonBillableAuthStatus = typeof NON_BILLABLE_AUTH_STATUSES[number];

/**
 * Check if an auth_status is non-billable
 */
export function isNonBillableAuthStatus(authStatus: string | null | undefined): boolean {
  if (!authStatus) return false;
  return NON_BILLABLE_AUTH_STATUSES.includes(authStatus as NonBillableAuthStatus);
}
