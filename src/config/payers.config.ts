/**
 * Payer Configuration
 *
 * Org-level payer configuration for payer treatment aging metrics.
 * If no payers configured for an org (empty array or org not in config),
 * ALL orders for that org are included.
 */

/**
 * Configured payers per organization.
 * Empty array or missing org = include ALL payers for that org.
 */
export const CONFIGURED_PAYERS_BY_ORG: Record<string, string[]> = {
  // Default: all orgs include all payers (empty arrays)
};

/**
 * Get configured payers for a facility.
 * Returns null if all payers should be included.
 */
export function getConfiguredPayers(facilityId: string): string[] | null {
  const payers = CONFIGURED_PAYERS_BY_ORG[facilityId];
  if (!payers || payers.length === 0) return null;
  return payers;
}

/**
 * Check if a payer is configured for a facility.
 * Returns true if payerName is in the org's list, or true if no payers configured (all pass).
 */
export function isConfiguredPayer(facilityId: string, payerName: string | null | undefined): boolean {
  if (!payerName) return false;
  const payers = getConfiguredPayers(facilityId);
  if (!payers) return true; // No filter = all pass
  return payers.includes(payerName);
}
