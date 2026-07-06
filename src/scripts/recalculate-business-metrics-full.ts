/**
 * Recalculate all business metrics from unique_orders_status
 * Clears and rebuilds the business_metrics_daily sheet
 */

import 'dotenv/config';
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES } from '../services/sheets-dual';

interface DailyFacilityMetrics {
  created_at_date: string;
  facility_id: string;
  total_orders: number;
  orders_assigned: number;
  orders_completed: number;
  orders_inprogress: number;
  total_billable_orders: number;
  status_auth_by_risa: number;
  status_auth_on_file: number;
  status_no_auth_required: number;
  status_denial_by_risa: number;
  status_denial_after_query: number;
  status_existing_denial: number;
  status_query: number;
  status_pending: number;
  status_hold: number;
  status_auth_required: number;
  status_other: number;
  user_completed_counts: Map<string, number>;
}

async function recalculateBusinessMetrics() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  RECALCULATE BUSINESS METRICS                  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId('unique_status');

  // Step 1: Read all orders
  console.log('📖 Reading all orders from unique_orders_status...');
  const ordersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.UNIQUE_ORDER_STATUS}!A:AQ`,
  });

  const rows = ordersResponse.data.values || [];
  const dataRows = rows.slice(1);
  console.log(`   Found ${dataRows.length.toLocaleString()} orders\n`);

  // Column indices (must match unique_orders_status sheet schema)
  const orderIdIndex = 0;
  const createdAtIndex = 1; // created_at_iso
  const assignedToIndex = 3; // assigned_to_name
  const orgIdIndex = 7; // org_id
  const authStatusIndex = 17; // auth_status
  const medicalOrderStatusIndex = 18; // medical_order_status
  const boCountIndex = 40; // bo_count
  const isDuplicateIndex = 42; // is_duplicate

  // Non-billable auth statuses (must match billing.config.ts)
  const NON_BILLABLE = ['not_to_work_fedora', 'not_to_work_stat', 'worked_by_onsite'];

  // Step 2: Aggregate by date and facility
  console.log('📊 Calculating metrics by date and facility...');
  const metricsMap = new Map<string, DailyFacilityMetrics>();
  let duplicatesSkipped = 0;

  for (const row of dataRows) {
    // Skip duplicate orders
    if (row[isDuplicateIndex] === 'TRUE') {
      duplicatesSkipped++;
      continue;
    }

    const orderId = row[orderIdIndex];
    const createdAtIso = row[createdAtIndex] || '';
    const assignedTo = row[assignedToIndex] || '';
    const orgId = row[orgIdIndex] || 'unknown';
    const authStatus = (row[authStatusIndex] || '').toLowerCase();
    const medOrderStatus = (row[medicalOrderStatusIndex] || '').toLowerCase();
    const boCount = parseInt(row[boCountIndex]) || 1;

    if (!orderId || !createdAtIso) continue;

    // Parse created_at date
    let createdDate: string;
    if (createdAtIso.includes('T')) {
      createdDate = createdAtIso.split('T')[0];
    } else if (createdAtIso.includes(' ')) {
      createdDate = createdAtIso.split(' ')[0];
    } else {
      continue;
    }
    if (!createdDate || createdDate.length !== 10) continue;

    const key = `${createdDate}|${orgId}`;

    if (!metricsMap.has(key)) {
      metricsMap.set(key, {
        created_at_date: createdDate,
        facility_id: orgId,
        total_orders: 0,
        orders_assigned: 0,
        orders_completed: 0,
        orders_inprogress: 0,
        total_billable_orders: 0,
        status_auth_by_risa: 0,
        status_auth_on_file: 0,
        status_no_auth_required: 0,
        status_denial_by_risa: 0,
        status_denial_after_query: 0,
        status_existing_denial: 0,
        status_query: 0,
        status_pending: 0,
        status_hold: 0,
        status_auth_required: 0,
        status_other: 0,
        user_completed_counts: new Map(),
      });
    }

    const metrics = metricsMap.get(key)!;
    metrics.total_orders++;

    // Assignment
    if (assignedTo && assignedTo.toLowerCase() !== 'unassigned') {
      metrics.orders_assigned++;
    }

    // Completed: exact match on medical_order_status (matches sync.ts)
    const isCompleted = medOrderStatus === 'order_completed_by_agent' || medOrderStatus === 'order_completed_by_human';
    const isInProgress = medOrderStatus === 'order_in_progress';

    if (isCompleted) {
      metrics.orders_completed++;
    } else if (isInProgress) {
      metrics.orders_inprogress++;
    }

    // Status distribution: ONLY for completed/in_progress orders, using auth_status exact match (matches sync.ts)
    if (isCompleted || isInProgress) {
      // Track per-user completed/in-progress counts (excluding RISA Agent)
      if (assignedTo && assignedTo.toLowerCase() !== 'risa agent') {
        metrics.user_completed_counts.set(assignedTo, (metrics.user_completed_counts.get(assignedTo) || 0) + 1);
      }

      // Non-billable check
      const isNonBillable = NON_BILLABLE.includes(authStatus);

      // Billable: completed + in_progress - non_billable + additional bo_count
      if (!isNonBillable) {
        metrics.total_billable_orders += 1;
      }
      // Additional bo_count (bo_count - 1) for orders with bo_count > 1
      if (boCount > 1) {
        metrics.total_billable_orders += (boCount - 1);
      }

      // Auth status categorization — exact match on auth_status (NOT master_auth_status)
      switch (authStatus) {
        case 'auth_by_risa':
          metrics.status_auth_by_risa++;
          break;
        case 'auth_on_file':
          metrics.status_auth_on_file++;
          break;
        case 'no_auth_required':
          metrics.status_no_auth_required++;
          break;
        case 'denial_by_risa':
        case 'denied_by_risa':
          metrics.status_denial_by_risa++;
          break;
        case 'denial_after_query':
          metrics.status_denial_after_query++;
          break;
        case 'existing_denial':
          metrics.status_existing_denial++;
          break;
        case 'query':
          metrics.status_query++;
          break;
        case 'pending':
          metrics.status_pending++;
          break;
        case 'hold':
          metrics.status_hold++;
          break;
        case 'auth_required':
          metrics.status_auth_required++;
          break;
        default:
          metrics.status_other++;
          break;
      }
    }
  }

  console.log(`   Calculated metrics for ${metricsMap.size.toLocaleString()} date/facility combinations\n`);

  // Step 3: Calculate percentages and format for sheets
  console.log('📝 Formatting data for sheets...');
  const outputRows: any[][] = [];

  for (const metrics of metricsMap.values()) {
    // Calculate rates
    const authByRisa = metrics.status_auth_by_risa;
    const denialByRisa = metrics.status_denial_by_risa;
    const approvalRate = authByRisa + denialByRisa > 0
      ? ((authByRisa / (authByRisa + denialByRisa)) * 100).toFixed(1)
      : '0.0';

    // authorization_rate = (auth + aof + nar) / (auth + aof + nar + denial_by_risa) × 100
    const authNumerator = metrics.status_auth_by_risa + metrics.status_auth_on_file + metrics.status_no_auth_required;
    const authDenominator = authNumerator + metrics.status_denial_by_risa;
    const authorizationRate = authDenominator > 0
      ? ((authNumerator / authDenominator) * 100).toFixed(1)
      : '0.0';

    const completionRate = metrics.total_orders > 0
      ? ((metrics.orders_completed / metrics.total_orders) * 100).toFixed(1)
      : '0.0';

    const inprogressRate = metrics.total_orders > 0
      ? ((metrics.orders_inprogress / metrics.total_orders) * 100).toFixed(1)
      : '0.0';

    const timestamp = new Date().toISOString();

    outputRows.push([
      metrics.created_at_date,
      metrics.facility_id,
      metrics.total_orders,
      metrics.orders_assigned,
      metrics.orders_completed,
      metrics.orders_inprogress,
      metrics.total_billable_orders,
      metrics.status_auth_by_risa,
      metrics.status_auth_on_file,
      metrics.status_no_auth_required,
      metrics.status_denial_by_risa,
      metrics.status_denial_after_query,
      metrics.status_existing_denial,
      metrics.status_query,
      metrics.status_pending,
      metrics.status_hold,
      metrics.status_auth_required,
      metrics.status_other,
      approvalRate,
      authorizationRate,
      completionRate,
      inprogressRate,
      timestamp,
      Array.from(metrics.user_completed_counts.values()).filter((c) => c >= 10).length,
    ]);
  }

  // Sort by date, then facility
  outputRows.sort((a, b) => {
    const dateCompare = a[0].localeCompare(b[0]);
    if (dateCompare !== 0) return dateCompare;
    return a[1].localeCompare(b[1]);
  });

  console.log(`   Prepared ${outputRows.length.toLocaleString()} rows\n`);

  // Step 4: Clear existing data and write new data
  console.log('🗑️  Clearing existing business_metrics_daily data...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A2:Z`,
  });

  console.log('📤 Writing new business metrics...');
  const BATCH_SIZE = 5000;
  let written = 0;

  for (let i = 0; i < outputRows.length; i += BATCH_SIZE) {
    const batch = outputRows.slice(i, i + BATCH_SIZE);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAMES.BUSINESS_METRICS_DAILY}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: batch,
      },
    });

    written += batch.length;
    console.log(`   Wrote ${written}/${outputRows.length} rows`);

    // Small delay between batches
    if (i + BATCH_SIZE < outputRows.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  ✅ BUSINESS METRICS RECALCULATED              ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`   Total orders in sheet: ${dataRows.length.toLocaleString()}`);
  console.log(`   Duplicates skipped: ${duplicatesSkipped.toLocaleString()}`);
  console.log(`   Orders processed: ${(dataRows.length - duplicatesSkipped).toLocaleString()}`);
  console.log(`   Metrics calculated for: ${outputRows.length.toLocaleString()} date/facility combinations`);
  console.log(`   Date range: ${outputRows[0][0]} to ${outputRows[outputRows.length - 1][0]}`);
  console.log('');
}

recalculateBusinessMetrics().catch(console.error);
