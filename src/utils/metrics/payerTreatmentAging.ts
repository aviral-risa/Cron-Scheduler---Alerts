import type { UniqueOrderStatus } from '../../types/orders';
import type { PayerTreatmentAgingRow } from '../../types/payerTreatmentAging';
import { countBusinessDays, parseDosString, isWorked } from './dosCoverage';
import { isConfiguredPayer } from '../../config/payers.config';
import { toISTTimestamp } from '../timezone';

/**
 * Calculate Payer Treatment Aging data from filtered orders.
 * Groups by (created_at_date, facility_id, payer_name) composite key.
 * Buckets by business days from creation to Date of Service.
 */
export function calculatePayerTreatmentAging(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): PayerTreatmentAgingRow[] {
  const rowMap = new Map<string, PayerTreatmentAgingRow>();
  const now = toISTTimestamp(new Date());

  for (const order of orders) {
    // Skip duplicates — they should never count in payer treatment aging
    if (order.is_duplicate) continue;

    const createdDate = order.created_at_iso?.split('T')[0]?.split(' ')[0] || '';
    if (!createdDate || createdDate < startDate || createdDate > endDate) continue;

    // Filter by configured payers
    if (!isConfiguredPayer(order.org_id, order.primary_payer_name)) continue;

    const payerName = order.primary_payer_name || 'Unknown';
    const key = `${createdDate}|${order.org_id}|${payerName}`;

    // Ensure row exists for this composite key
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        created_at_date: createdDate,
        facility_id: order.org_id,
        payer_name: payerName,
        total_orders_loaded: 0,
        total_orders_billed: 0,
        loaded_0_to_7: 0,
        loaded_8_to_14: 0,
        loaded_15_to_21: 0,
        loaded_21_plus: 0,
        billed_0_to_7: 0,
        billed_8_to_14: 0,
        billed_15_to_21: 0,
        billed_21_plus: 0,
        last_updated_timestamp: now,
      });
    }

    const row = rowMap.get(key)!;

    // Loaded: simple count, no BO adjustment
    row.total_orders_loaded += 1;

    // Worked: use isWorked() instead of isBillable()
    const worked = isWorked(order);
    if (worked) {
      row.total_orders_billed += 1;
    }

    // Parse DoS for bucket assignment
    const dosStr = parseDosString(order.date_of_service_iso);
    if (!dosStr) continue;

    const created = new Date(createdDate + 'T00:00:00');
    const dos = new Date(dosStr + 'T00:00:00');

    if (isNaN(dos.getTime())) continue;

    // Only bucket if DoS is on or after creation date
    if (dos < created) continue;

    const bizDays = countBusinessDays(created, dos);

    // Loaded buckets (no BO adjustment)
    if (bizDays <= 7) {
      row.loaded_0_to_7 += 1;
    } else if (bizDays <= 14) {
      row.loaded_8_to_14 += 1;
    } else if (bizDays <= 21) {
      row.loaded_15_to_21 += 1;
    } else {
      row.loaded_21_plus += 1;
    }

    // Worked buckets (no BO adjustment)
    if (worked) {
      if (bizDays <= 7) {
        row.billed_0_to_7 += 1;
      } else if (bizDays <= 14) {
        row.billed_8_to_14 += 1;
      } else if (bizDays <= 21) {
        row.billed_15_to_21 += 1;
      } else {
        row.billed_21_plus += 1;
      }
    }
  }

  // Sort: date asc, then facility_id, then payer_name
  return Array.from(rowMap.values()).sort((a, b) => {
    const dateCompare = a.created_at_date.localeCompare(b.created_at_date);
    if (dateCompare !== 0) return dateCompare;
    const facCompare = a.facility_id.localeCompare(b.facility_id);
    if (facCompare !== 0) return facCompare;
    return a.payer_name.localeCompare(b.payer_name);
  });
}
