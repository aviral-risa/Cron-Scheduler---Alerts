import type { UniqueOrderStatus } from '../../types/orders';
import type { DosCoverageRow } from '../../types/dosCoverage';
import { MEDICAL_ORDER_STATUS } from '../../types/agentModeMetrics';

/**
 * Count business days (weekdays) between two dates.
 * Counts each Mon-Fri from the day after fromDate up to and including toDate.
 */
export function countBusinessDays(fromDate: Date, toDate: Date): number {
  let count = 0;
  const current = new Date(fromDate);
  current.setDate(current.getDate() + 1); // start from day after fromDate

  while (current <= toDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/** Worked = In Progress or Completed (by agent or human) */
export function isWorked(order: UniqueOrderStatus): boolean {
  return (
    order.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT ||
    order.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN ||
    order.medical_order_status === MEDICAL_ORDER_STATUS.IN_PROGRESS
  );
}

/**
 * Parse a date-of-service string that may be in MM/DD/YYYY or YYYY-MM-DD format.
 * Returns a normalized YYYY-MM-DD string, or null if unparseable.
 */
export function parseDosString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = raw.split('T')[0].split(' ')[0];
  if (!str) return null;

  // Handle MM/DD/YYYY format
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return null;
  }

  return str; // Already YYYY-MM-DD
}

/**
 * Calculate DoS Coverage data from filtered orders.
 * Groups orders by created_at_date, buckets by business days from creation to Date of Service.
 */
export function calculateDosCoverage(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): DosCoverageRow[] {
  const rowMap = new Map<string, DosCoverageRow>();

  for (const order of orders) {
    const createdDate = order.created_at_iso?.split('T')[0]?.split(' ')[0] || '';
    if (!createdDate || createdDate < startDate || createdDate > endDate) continue;

    // Ensure row exists for this date
    if (!rowMap.has(createdDate)) {
      rowMap.set(createdDate, {
        date: createdDate,
        totalOrders: 0,
        bucket0to7: 0,
        bucket8to14: 0,
        bucket15to21: 0,
        bucket21plus: 0,
        ordersWorked: 0,
        worked0to7: 0,
        worked8to14: 0,
        worked15to21: 0,
        worked21plus: 0,
      });
    }

    const row = rowMap.get(createdDate)!;
    row.totalOrders++;

    const dosStr = parseDosString(order.date_of_service_iso);
    if (!dosStr) continue;

    const created = new Date(createdDate + 'T00:00:00');
    const dos = new Date(dosStr + 'T00:00:00');

    if (isNaN(dos.getTime())) continue;

    // Only bucket if DoS is on or after creation date (treatment is in the future)
    if (dos < created) continue;

    const bizDays = countBusinessDays(created, dos);
    const worked = isWorked(order);

    if (bizDays <= 7) {
      row.bucket0to7++;
      if (worked) row.worked0to7++;
    } else if (bizDays <= 14) {
      row.bucket8to14++;
      if (worked) row.worked8to14++;
    } else if (bizDays <= 21) {
      row.bucket15to21++;
      if (worked) row.worked15to21++;
    } else {
      row.bucket21plus++;
      if (worked) row.worked21plus++;
    }
  }

  // Sort by date ascending
  return Array.from(rowMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
