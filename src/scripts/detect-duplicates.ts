/**
 * Detect and Mark Duplicate Orders
 *
 * Duplicate Logic:
 * - Composite key = patient_mrn | regimen_name | date_of_service_iso
 * - Only orders with master_auth_status in DUPLICATE_ELIGIBLE_STATUSES are candidates
 * - For each composite key group, the FIRST occurrence (earliest created_at_iso date) is original
 * - All subsequent occurrences (later created_at dates) are marked as duplicate
 * - Column AQ (is_duplicate) = "TRUE" for duplicates
 *
 * Usage:
 *   npm run cli detect-duplicates
 *   npm run cli detect-duplicates -- --dry-run     (preview without writing)
 *   npm run cli detect-duplicates -- --org nycbs
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';
import { ORGANIZATIONS } from '../config/organizations';

/**
 * Orders with these master_auth_status values are candidates for duplicate detection.
 * If the same MRN+regimen+DOS appears on a later created_at date with one of these statuses,
 * the later occurrence is a duplicate.
 */
export const DUPLICATE_ELIGIBLE_STATUSES = new Set([
  'urology',
  'oral_drug',
  'pcp',
  'poi',
  'gold_bag',
  'on_study_patient',
  'not_to_work_oral_drug',
]);

interface OrderRow {
  orderId: string;
  rowIndex: number;       // 1-indexed sheet row
  compositeKey: string;   // mrn|regimen|dos
  createdAtDate: string;  // date portion of created_at_iso
  masterAuthStatus: string;
  orgId: string;
  currentIsDuplicate: boolean;
}

export interface DuplicateDetectionResult {
  totalScanned: number;
  uniqueKeys: number;
  keysWithDuplicates: number;
  markedDuplicate: number;
  unmarked: number;
}

export async function detectDuplicates(): Promise<DuplicateDetectionResult> {
  const startTime = Date.now();

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Detect & Mark Duplicate Orders               ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Parse flags
  let dryRun = false;
  let orgFilter: Set<string> | undefined;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--dry-run') {
      dryRun = true;
      console.log('🔍 DRY RUN MODE — no writes will be made\n');
    }
    if (process.argv[i] === '--org' && process.argv[i + 1]) {
      orgFilter = new Set<string>();
      const orgIds = process.argv[i + 1].toLowerCase().split(',');
      for (const orgId of orgIds) {
        const org = ORGANIZATIONS.find((o) => o.id === orgId.trim());
        if (!org) {
          console.error(`❌ Unknown org '${orgId.trim()}'. Valid: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`);
          process.exit(1);
        }
        orgFilter.add(org.facilityId);
      }
      console.log(`Filtering to orgs: ${orgIds.join(', ')}\n`);
      i++;
    }
  }

  console.log('Duplicate-eligible master_auth_status values:');
  DUPLICATE_ELIGIBLE_STATUSES.forEach((s) => console.log(`   • ${s}`));
  console.log('');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  if (!spreadsheetId) {
    console.error('❌ UNIQUE_STATUS_SHEETS_ID not configured');
    process.exit(1);
  }

  console.log('Reading unique_orders_status sheet...\n');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    console.log('No data found');
    return { totalScanned: 0, uniqueKeys: 0, keysWithDuplicates: 0, markedDuplicate: 0, unmarked: 0 };
  }

  const headers = rows[0];
  const orderIdIdx = headers.indexOf('order_id');
  const createdAtIdx = headers.indexOf('created_at_iso');
  const orgIdIdx = headers.indexOf('org_id');
  const regimenIdx = headers.indexOf('regimen_name');
  const dosIdx = headers.indexOf('date_of_service_iso');
  const masterAuthIdx = headers.indexOf('master_auth_status');
  const mrnIdx = headers.indexOf('patient_mrn');
  const isDupIdx = headers.indexOf('is_duplicate');
  const isDupColIdx = isDupIdx !== -1 ? isDupIdx : 42;

  console.log(`Total orders in sheet: ${(rows.length - 1).toLocaleString()}\n`);

  // Parse all orders
  const allOrders: OrderRow[] = [];

  rows.slice(1).forEach((row, idx) => {
    const orgId = row[orgIdIdx] || '';
    if (orgFilter && !orgFilter.has(orgId)) return;

    const mrn = row[mrnIdx] || '';
    const regimen = row[regimenIdx] || '';
    const dos = row[dosIdx] || '';
    const masterAuth = row[masterAuthIdx] || '';
    const createdAt = row[createdAtIdx] || '';
    const createdAtDate = createdAt.split('T')[0]?.split(' ')[0] || '';

    // Only process orders that have all three key components
    if (!mrn || !regimen || !dos) return;

    // Only process orders with eligible master_auth_status
    if (!DUPLICATE_ELIGIBLE_STATUSES.has(masterAuth)) return;

    allOrders.push({
      orderId: row[orderIdIdx],
      rowIndex: idx + 2,  // +2 for header + 1-indexed
      compositeKey: `${mrn}|${regimen}|${dos}`,
      createdAtDate,
      masterAuthStatus: masterAuth,
      orgId,
      currentIsDuplicate: row[isDupColIdx] === 'TRUE',
    });
  });

  console.log(`Orders with eligible statuses: ${allOrders.length.toLocaleString()}`);

  // Group by composite key
  const groups = new Map<string, OrderRow[]>();
  for (const order of allOrders) {
    if (!groups.has(order.compositeKey)) {
      groups.set(order.compositeKey, []);
    }
    groups.get(order.compositeKey)!.push(order);
  }

  console.log(`Unique composite keys (MRN|regimen|DOS): ${groups.size.toLocaleString()}`);

  // Identify duplicates: within each group, sort by created_at_date, first = original, rest = duplicate
  const toMarkDuplicate: Array<{ rowIndex: number; orderId: string; key: string; date: string }> = [];
  const toUnmarkDuplicate: Array<{ rowIndex: number; orderId: string }> = [];
  let groupsWithDuplicates = 0;

  for (const [key, groupOrders] of groups) {
    if (groupOrders.length <= 1) {
      // Single occurrence — ensure not marked as duplicate
      if (groupOrders[0].currentIsDuplicate) {
        toUnmarkDuplicate.push({ rowIndex: groupOrders[0].rowIndex, orderId: groupOrders[0].orderId });
      }
      continue;
    }

    // Sort by created_at_date ascending — earliest first
    groupOrders.sort((a, b) => a.createdAtDate.localeCompare(b.createdAtDate));

    // First occurrence = original (ensure not marked)
    const original = groupOrders[0];
    if (original.currentIsDuplicate) {
      toUnmarkDuplicate.push({ rowIndex: original.rowIndex, orderId: original.orderId });
    }

    // All subsequent = duplicates
    let hasDuplicates = false;
    for (let i = 1; i < groupOrders.length; i++) {
      const dup = groupOrders[i];
      if (!dup.currentIsDuplicate) {
        toMarkDuplicate.push({ rowIndex: dup.rowIndex, orderId: dup.orderId, key, date: dup.createdAtDate });
      }
      hasDuplicates = true;
    }

    if (hasDuplicates) groupsWithDuplicates++;
  }

  console.log(`\nComposite keys with duplicates: ${groupsWithDuplicates.toLocaleString()}`);
  console.log(`Orders to mark as duplicate: ${toMarkDuplicate.length.toLocaleString()}`);
  console.log(`Orders to unmark (false positives): ${toUnmarkDuplicate.length.toLocaleString()}\n`);

  // Show sample duplicates
  if (toMarkDuplicate.length > 0) {
    console.log('Sample duplicates (first 10):');
    console.log('─'.repeat(70));
    toMarkDuplicate.slice(0, 10).forEach((d) => {
      console.log(`   Order ${d.orderId} | Key: ${d.key} | Created: ${d.date}`);
    });
    console.log('');
  }

  // Per-org breakdown
  const orgBreakdown = new Map<string, number>();
  toMarkDuplicate.forEach((d) => {
    const order = allOrders.find((o) => o.orderId === d.orderId);
    const orgName = ORGANIZATIONS.find((o) => o.facilityId === order?.orgId)?.name || order?.orgId || 'unknown';
    orgBreakdown.set(orgName, (orgBreakdown.get(orgName) || 0) + 1);
  });

  if (orgBreakdown.size > 0) {
    console.log('Duplicates by org:');
    for (const [org, count] of Array.from(orgBreakdown.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${org}: ${count.toLocaleString()}`);
    }
    console.log('');
  }

  const result: DuplicateDetectionResult = {
    totalScanned: allOrders.length,
    uniqueKeys: groups.size,
    keysWithDuplicates: groupsWithDuplicates,
    markedDuplicate: toMarkDuplicate.length,
    unmarked: toUnmarkDuplicate.length,
  };

  if (dryRun) {
    console.log('🔍 DRY RUN — no changes written. Remove --dry-run to apply.\n');
    return result;
  }

  // Write changes to column AQ
  if (toMarkDuplicate.length === 0 && toUnmarkDuplicate.length === 0) {
    console.log('✅ No changes needed — all duplicates already marked correctly.\n');
    return result;
  }

  console.log('Writing changes to sheet...\n');

  const updates: Array<{ range: string; values: any[][] }> = [];

  // Mark duplicates as TRUE
  for (const d of toMarkDuplicate) {
    updates.push({
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AQ${d.rowIndex}`,
      values: [['TRUE']],
    });
  }

  // Unmark false positives
  for (const d of toUnmarkDuplicate) {
    updates.push({
      range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!AQ${d.rowIndex}`,
      values: [['']],
    });
  }

  // Batch write in chunks
  const BATCH_SIZE = 5000;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

    console.log(`   Writing batch ${batchNum}/${totalBatches} (${batch.length} cells)...`);

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: batch,
      },
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(70));
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  DUPLICATE DETECTION COMPLETE                 ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   Total orders scanned: ${allOrders.length.toLocaleString()}`);
  console.log(`   Unique composite keys: ${groups.size.toLocaleString()}`);
  console.log(`   Keys with duplicates: ${groupsWithDuplicates.toLocaleString()}`);
  console.log(`   Orders marked duplicate: ${toMarkDuplicate.length.toLocaleString()}`);
  console.log(`   Orders unmarked: ${toUnmarkDuplicate.length.toLocaleString()}`);
  console.log(`   Duration: ${duration}s`);
  console.log('');

  return result;
}
