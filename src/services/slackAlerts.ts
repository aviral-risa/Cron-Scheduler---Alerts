/**
 * @deprecated This service has been moved to src/alerts/unworked-orders-alert.ts
 * This file is kept for backward compatibility only.
 * Please use the new alert functions from src/alerts/ instead.
 */

import {
  sendUnworkedOrdersAlertForOrg,
  sendUnworkedOrdersAlerts,
} from '../alerts/unworked-orders-alert';
import type { Organization } from '../config/organizations';

/**
 * @deprecated Use sendUnworkedOrdersAlertForOrg from '../alerts/unworked-orders-alert' instead
 */
export async function sendSlackAlertForOrg(
  org: Organization,
  date: Date = new Date()
): Promise<void> {
  return sendUnworkedOrdersAlertForOrg(org, date);
}

/**
 * @deprecated Use sendUnworkedOrdersAlerts from '../alerts/unworked-orders-alert' instead
 */
export async function sendDailySlackAlerts(date: Date = new Date()): Promise<void> {
  return sendUnworkedOrdersAlerts(date);
}
