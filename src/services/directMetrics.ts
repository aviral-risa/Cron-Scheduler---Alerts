/**
 * Direct metrics calculation from configured data source
 * Uses data-source abstraction layer (Algolia or Firestore)
 * This is a simplified version that shows basic metrics without 7-day averages
 */

import { fetchOrdersByDate } from './data-source';
import { toISTTimestamp, toISTHour } from '../utils/timezone';
import type { OrgMetrics, PersonMetrics, OrderSnapshot } from '../types/orders';

/**
 * Calculate org-level metrics from raw orders
 */
export async function calculateOrgMetrics(
  facilityId: string,
  date: string
): Promise<OrgMetrics | null> {
  try {
    const orders = await fetchOrdersByDate(new Date(date), facilityId);

    if (orders.length === 0) {
      return null;
    }

    const ordersLoaded = orders.length;
    const ordersAssigned = orders.filter(o => o.is_assigned).length;
    const ordersWorked = orders.filter(o => o.is_worked).length;
    const ordersNotWorkedAssigned = ordersAssigned - ordersWorked;
    const workRatePct = ordersAssigned > 0 ? (ordersWorked / ordersAssigned) * 100 : 0;

    return {
      snapshot_timestamp: toISTTimestamp(new Date()),
      snapshot_hour_ist: String(toISTHour(new Date())),
      created_at_date: date,
      facility_id: facilityId,
      orders_loaded_today: ordersLoaded,
      orders_assigned: ordersAssigned,
      orders_worked: ordersWorked,
      orders_not_worked_assigned: ordersNotWorkedAssigned,
      work_rate_pct: Math.round(workRatePct * 10) / 10,
      // Simplified - no historical data available
      avg_worked_last_7_working_days: 0,
      pace_vs_avg: 0,
      pace_status: 'ON_PACE',
      projected_eod_worked: ordersWorked,
    };
  } catch (error) {
    console.error('Error calculating org metrics:', error);
    throw error;
  }
}

/**
 * Calculate person-level metrics from raw orders
 */
export async function calculatePersonMetrics(
  facilityId: string,
  date: string
): Promise<PersonMetrics[]> {
  try {
    const orders = await fetchOrdersByDate(new Date(date), facilityId);

    // Group orders by provider
    const providerMap = new Map<string, OrderSnapshot[]>();

    orders.forEach(order => {
      const providerName = order.provider_name;
      if (providerName && providerName.toLowerCase() !== 'unassigned') {
        if (!providerMap.has(providerName)) {
          providerMap.set(providerName, []);
        }
        providerMap.get(providerName)!.push(order);
      }
    });

    // Calculate metrics for each provider
    const metrics: PersonMetrics[] = [];

    for (const [providerName, providerOrders] of providerMap) {
      const assignedCount = providerOrders.length;
      const workedCount = providerOrders.filter(o => o.is_worked).length;
      const notWorkedCount = assignedCount - workedCount;

      // Extract login/logoff times from worked orders
      const workedOrders = providerOrders.filter(o => o.date_of_work);
      const workTimes = workedOrders
        .map(o => o.date_of_work)
        .filter((t): t is string => !!t)
        .sort();

      const loginTime = workTimes.length > 0 ? workTimes[0] : null;
      const logoffTime = workTimes.length > 0 ? workTimes[workTimes.length - 1] : null;

      metrics.push({
        snapshot_timestamp: toISTTimestamp(new Date()),
        snapshot_hour_ist: String(toISTHour(new Date())),
        created_at_date: date,
        facility_id: facilityId,
        provider_name: providerName,
        assigned_count: assignedCount,
        worked_count: workedCount,
        not_worked_count: notWorkedCount,
        // Simplified - no historical data
        avg_worked_last_7_working_days: 0,
        person_pace_vs_avg: 0,
        person_pace_status: 'ON_PACE',
        login_time: loginTime,
        logoff_time: logoffTime,
      });
    }

    return metrics.sort((a, b) => b.worked_count - a.worked_count);
  } catch (error) {
    console.error('Error calculating person metrics:', error);
    throw error;
  }
}

/**
 * For now, just return current metrics as "hourly" data
 * Full hourly tracking would require backend storage
 */
export async function calculateHourlyMetrics(
  facilityId: string,
  date: string
): Promise<OrgMetrics[]> {
  const currentMetrics = await calculateOrgMetrics(facilityId, date);
  return currentMetrics ? [currentMetrics] : [];
}
