import { format, isWeekend, subDays } from 'date-fns';
import { fetchOrdersByDate } from './data-source'; // Now uses configurable data source (Algolia or Firestore)
import {
  appendOrgMetrics,
  appendPersonMetrics,
  getWorkingDayConfig,
  getUniqueOrdersForDate,
  appendOrUpdateBusinessMetrics,
} from './sheets-dual'; // MIGRATED: Using dual-spreadsheet architecture to fix 10M cell limit
import type { OrderSnapshot, OrgMetrics, PersonMetrics, BusinessMetricsDaily } from '../types/orders';
import type { EVDailySummary } from '../types/evMetrics';
import type { AlgoliaOrder } from './algolia/fetch.service';
import { ORGANIZATIONS } from '../config/organizations';
import { toISTTimestamp, toISTDate, toISTHour } from '../utils/timezone';
import { logCurrentDataSource } from './data-source';
import { logSpreadsheetConfig } from '../config/data-source.config';
import { isNonBillableAuthStatus } from '../config/billing.config';
import { normalizeActiveStatus, classifyErrorType } from '../utils/metrics/evMetrics';

/**
 * Check if a date is a working day
 */
export async function isWorkingDay(date: Date): Promise<boolean> {
  const dateStr = format(date, 'yyyy-MM-dd');

  // Check config override first
  const config = await getWorkingDayConfig(dateStr);
  if (config) {
    return config.is_working_day;
  }

  // Default: exclude weekends
  if (isWeekend(date)) {
    return false;
  }

  return true;
}

/**
 * Get last N working days
 */
export async function getLastNWorkingDays(currentDate: Date, n: number): Promise<Date[]> {
  const workingDays: Date[] = [];
  let date = new Date(currentDate);

  while (workingDays.length < n) {
    date = subDays(date, 1);

    if (await isWorkingDay(date)) {
      workingDays.push(new Date(date));
    }

    // Safety: don't go back more than 30 days
    if (workingDays.length === 0 && Math.abs(date.getTime() - currentDate.getTime()) > 30 * 24 * 60 * 60 * 1000) {
      break;
    }
  }

  return workingDays;
}

/**
 * Calculate org-level metrics
 */
function calculateOrgMetrics(
  snapshots: OrderSnapshot[],
  facilityId: string,
  snapshotTime: Date,
  ordersDate: Date,
  historicalAvg: number
): OrgMetrics {
  const orgSnapshots = snapshots.filter((s) => s.facility_id === facilityId);

  const ordersLoaded = orgSnapshots.length;
  const ordersAssigned = orgSnapshots.filter((s) => s.is_assigned).length;
  const ordersWorked = orgSnapshots.filter((s) => s.is_worked).length;
  const ordersNotWorkedAssigned = orgSnapshots.filter(
    (s) => s.is_assigned && !s.is_worked
  ).length;

  const workRate = ordersLoaded > 0 ? (ordersWorked / ordersLoaded) * 100 : 0;
  const paceVsAvg = ordersWorked - historicalAvg;

  let paceStatus: 'AHEAD' | 'ON_PACE' | 'BEHIND';
  if (paceVsAvg > 5) {
    paceStatus = 'AHEAD';
  } else if (paceVsAvg < -5) {
    paceStatus = 'BEHIND';
  } else {
    paceStatus = 'ON_PACE';
  }

  // Project EOD based on current hour
  const currentHour = snapshotTime.getHours();
  const workStartHour = 11; // Work starts at 11 AM
  const workEndHour = 20; // Work ends at 8 PM
  const totalWorkHours = workEndHour - workStartHour;
  const hoursWorkedSoFar = Math.max(currentHour - workStartHour, 0);

  let projectedEod = ordersWorked;
  if (hoursWorkedSoFar > 0 && hoursWorkedSoFar < totalWorkHours) {
    projectedEod = Math.round((ordersWorked / hoursWorkedSoFar) * totalWorkHours);
  }

  return {
    snapshot_timestamp: toISTTimestamp(snapshotTime),
    snapshot_hour_ist: String(toISTHour(snapshotTime)),
    created_at_date: toISTDate(ordersDate),
    facility_id: facilityId,
    orders_loaded_today: ordersLoaded,
    orders_assigned: ordersAssigned,
    orders_worked: ordersWorked,
    orders_not_worked_assigned: ordersNotWorkedAssigned,
    work_rate_pct: Math.round(workRate * 10) / 10,
    avg_worked_last_7_working_days: historicalAvg,
    pace_vs_avg: paceVsAvg,
    pace_status: paceStatus,
    projected_eod_worked: projectedEod,
  };
}

/**
 * Calculate person-level metrics
 */
function calculatePersonMetrics(
  snapshots: OrderSnapshot[],
  facilityId: string,
  snapshotTime: Date,
  ordersDate: Date,
  historicalAvgByPerson: Map<string, number>
): PersonMetrics[] {
  const orgSnapshots = snapshots.filter((s) => s.facility_id === facilityId);

  // Group by provider
  const byProvider = new Map<string, OrderSnapshot[]>();
  orgSnapshots.forEach((s) => {
    if (s.provider_name) {
      if (!byProvider.has(s.provider_name)) {
        byProvider.set(s.provider_name, []);
      }
      byProvider.get(s.provider_name)!.push(s);
    }
  });

  const metrics: PersonMetrics[] = [];

  byProvider.forEach((orders, providerName) => {
    const assignedCount = orders.length;
    const workedCount = orders.filter((o) => o.is_worked).length;
    const notWorkedCount = assignedCount - workedCount;

    // Calculate login_time and logoff_time from completed orders
    const targetDate = toISTDate(ordersDate);
    const completedOrders = orders.filter(
      (o) => o.created_at_date === targetDate && o.is_worked && o.date_of_work
    );

    let loginTime: string | null = null;
    let logoffTime: string | null = null;

    if (completedOrders.length > 0) {
      const workTimestamps = completedOrders
        .map((o) => o.date_of_work!)
        .sort(); // Lexicographic sort for "YYYY-MM-DD HH:MM:SS" format

      // Login time: Always show first completion timestamp
      loginTime = workTimestamps[0];

      // Logoff time: Conditional based on sync type
      // Check if this is a historical sync (syncing past date) or same-day sync
      const isHistoricalSync = toISTDate(snapshotTime) !== targetDate;

      if (notWorkedCount === 0 || isHistoricalSync) {
        // Show logoff time if: (1) all orders complete, OR (2) syncing historical data
        logoffTime = workTimestamps[workTimestamps.length - 1];
      }
      // Otherwise: logoffTime remains null (will show "NA")
    }

    const historicalAvg = historicalAvgByPerson.get(providerName) || 0;
    const paceVsAvg = workedCount - historicalAvg;

    let paceStatus: 'AHEAD' | 'ON_PACE' | 'BEHIND';
    if (paceVsAvg > 2) {
      paceStatus = 'AHEAD';
    } else if (paceVsAvg < -2) {
      paceStatus = 'BEHIND';
    } else {
      paceStatus = 'ON_PACE';
    }

    metrics.push({
      snapshot_timestamp: toISTTimestamp(snapshotTime),
      snapshot_hour_ist: String(toISTHour(snapshotTime)),
      created_at_date: toISTDate(ordersDate),
      facility_id: facilityId,
      provider_name: providerName,
      assigned_count: assignedCount,
      worked_count: workedCount,
      not_worked_count: notWorkedCount,
      avg_worked_last_7_working_days: historicalAvg,
      person_pace_vs_avg: paceVsAvg,
      person_pace_status: paceStatus,
      login_time: loginTime,
      logoff_time: logoffTime,
    });
  });

  return metrics;
}

/**
 * Calculate business metrics from unique order status data
 * This function reads from unique_orders_status and calculates aggregated metrics
 * for storage in business_metrics_daily sheet
 */
export async function calculateBusinessMetrics(
  date: string,
  facilityId: string,
  prefetchedOrders?: import('../types/orders').UniqueOrderStatus[]
): Promise<BusinessMetricsDaily> {
  console.log(`Calculating business metrics for ${facilityId} on ${date}...`);

  // Use pre-fetched orders if provided, otherwise read from sheet
  // Filter out duplicates — they should never count in business metrics
  const allOrders = prefetchedOrders ?? await getUniqueOrdersForDate(date, facilityId);
  const orders = allOrders.filter((o) => !o.is_duplicate);

  if (orders.length === 0) {
    console.log(`No orders found for ${facilityId} on ${date}, returning zero metrics`);
    return {
      created_at_date: date,
      facility_id: facilityId,
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
      approval_rate_pct: 0,
      authorization_rate_pct: 0,
      order_completion_pct: 0,
      order_inprogress_pct: 0,
      last_updated_timestamp: toISTTimestamp(new Date()),
    };
  }

  // Volume metrics based on medical_order_status
  const totalOrders = orders.length;
  const ordersAssigned = orders.filter((o) =>
    o.assigned_to_name !== null &&
    o.assigned_to_name.toLowerCase() !== 'unassigned'
  ).length;

  // Completed: medical_order_status = "Order Completed by Agent" or "Order Completed by Human"
  const ordersCompleted = orders.filter((o) => {
    const status = o.medical_order_status?.toLowerCase() || '';
    return status === 'order_completed_by_agent' || status === 'order_completed_by_human';
  }).length;

  // In Progress: medical_order_status = "Order in progress"
  const ordersInProgress = orders.filter((o) => {
    const status = o.medical_order_status?.toLowerCase() || '';
    return status === 'order_in_progress';
  }).length;

  // Calculate non-billable orders (completed OR in_progress with non-billable auth_status)
  const nonBillableOrders = orders.filter((o) => {
    const medStatus = o.medical_order_status?.toLowerCase() || '';
    const isCompletedOrInProgress =
      medStatus === 'order_completed_by_agent' ||
      medStatus === 'order_completed_by_human' ||
      medStatus === 'order_in_progress';

    if (!isCompletedOrInProgress) return false;

    return isNonBillableAuthStatus(o.auth_status);
  }).length;

  // Calculate additional bo_count (for orders with bo_count > 1)
  const additionalBoCount = orders
    .filter((o) => {
      const medStatus = o.medical_order_status?.toLowerCase() || '';
      return (
        medStatus === 'order_completed_by_agent' ||
        medStatus === 'order_completed_by_human' ||
        medStatus === 'order_in_progress'
      );
    })
    .reduce((sum, o) => {
      const boCount = o.bo_count || 1; // Default to 1 if not set
      return sum + Math.max(0, boCount - 1); // Add (bo_count - 1)
    }, 0);

  // Calculate total billable orders
  const totalBillableOrders =
    ordersCompleted + ordersInProgress - nonBillableOrders + additionalBoCount;

  // Log breakdown for debugging
  console.log(`   Billable orders breakdown:`);
  console.log(`   - Completed: ${ordersCompleted}`);
  console.log(`   - In Progress: ${ordersInProgress}`);
  console.log(`   - Non-Billable: ${nonBillableOrders}`);
  console.log(`   - Additional BO Count: ${additionalBoCount}`);
  console.log(`   - Total Billable: ${totalBillableOrders}`);

  // Status distribution: Count auth_status (NOT master_auth_status) for In Progress + Completed orders ONLY
  const statusCounts = {
    auth_by_risa: 0,
    auth_on_file: 0,
    no_auth_required: 0,
    denial_by_risa: 0,
    denial_after_query: 0,
    existing_denial: 0,
    query: 0,
    pending: 0,
    hold: 0,
    auth_required: 0,
    other: 0,
  };

  // Filter to only In Progress or Completed orders
  const inProgressOrCompletedOrders = orders.filter((o) => {
    const medStatus = o.medical_order_status?.toLowerCase() || '';
    return medStatus === 'order_in_progress' ||
           medStatus === 'order_completed_by_agent' ||
           medStatus === 'order_completed_by_human';
  });

  // Count by auth_status (NOT master_auth_status)
  inProgressOrCompletedOrders.forEach((order) => {
    const status = order.auth_status?.toLowerCase() || '';
    switch (status) {
      case 'auth_by_risa':
        statusCounts.auth_by_risa++;
        break;
      case 'auth_on_file':
        statusCounts.auth_on_file++;
        break;
      case 'no_auth_required':
        statusCounts.no_auth_required++;
        break;
      case 'denial_by_risa':
      case 'denied_by_risa':
        statusCounts.denial_by_risa++;
        break;
      case 'denial_after_query':
        statusCounts.denial_after_query++;
        break;
      case 'existing_denial':
        statusCounts.existing_denial++;
        break;
      case 'query':
        statusCounts.query++;
        break;
      case 'pending':
        statusCounts.pending++;
        break;
      case 'hold':
        statusCounts.hold++;
        break;
      case 'auth_required':
        statusCounts.auth_required++;
        break;
      default:
        statusCounts.other++;
        break;
    }
  });

  // Calculated rates
  const approvalRate =
    statusCounts.auth_by_risa + statusCounts.denial_by_risa > 0
      ? (statusCounts.auth_by_risa / (statusCounts.auth_by_risa + statusCounts.denial_by_risa)) * 100
      : 0;

  // authorization_rate = (auth + aof + nar) / (auth + aof + nar + denial_by_risa) × 100
  const authNumerator = statusCounts.auth_by_risa + statusCounts.auth_on_file + statusCounts.no_auth_required;
  const authDenominator = authNumerator + statusCounts.denial_by_risa;
  const authorizationRate = authDenominator > 0 ? (authNumerator / authDenominator) * 100 : 0;

  const orderCompletionPct = totalOrders > 0 ? (ordersCompleted / totalOrders) * 100 : 0;
  const orderInProgressPct = totalOrders > 0 ? (ordersInProgress / totalOrders) * 100 : 0;

  // Calculate distinct users who completed 10+ orders, excluding RISA Agent
  const userCompletedCounts = new Map<string, number>();
  inProgressOrCompletedOrders.forEach((o) => {
    const name = o.assigned_to_name?.trim();
    if (name && name.toLowerCase() !== 'risa agent') {
      userCompletedCounts.set(name, (userCompletedCounts.get(name) || 0) + 1);
    }
  });
  const distinctUsersWorked = Array.from(userCompletedCounts.values()).filter((count) => count >= 10).length;

  const metrics: BusinessMetricsDaily = {
    created_at_date: date,
    facility_id: facilityId,
    total_orders: totalOrders,
    orders_assigned: ordersAssigned,
    orders_completed: ordersCompleted,
    orders_inprogress: ordersInProgress,
    total_billable_orders: totalBillableOrders,
    status_auth_by_risa: statusCounts.auth_by_risa,
    status_auth_on_file: statusCounts.auth_on_file,
    status_no_auth_required: statusCounts.no_auth_required,
    status_denial_by_risa: statusCounts.denial_by_risa,
    status_denial_after_query: statusCounts.denial_after_query,
    status_existing_denial: statusCounts.existing_denial,
    status_query: statusCounts.query,
    status_pending: statusCounts.pending,
    status_hold: statusCounts.hold,
    status_auth_required: statusCounts.auth_required,
    status_other: statusCounts.other,
    approval_rate_pct: Math.round(approvalRate * 10) / 10, // Round to 1 decimal
    authorization_rate_pct: Math.round(authorizationRate * 10) / 10,
    order_completion_pct: Math.round(orderCompletionPct * 10) / 10,
    order_inprogress_pct: Math.round(orderInProgressPct * 10) / 10,
    last_updated_timestamp: toISTTimestamp(new Date()),
    distinct_users_worked: distinctUsersWorked,
  };

  console.log(`✅ Calculated business metrics for ${facilityId} on ${date}: ${totalOrders} orders`);
  return metrics;
}

/**
 * Calculate EV metrics daily from unique order status data
 * Reads from unique_orders_status and calculates pre-aggregated EV metrics
 * for storage in ev_metrics_daily sheet (TECH_METRICS spreadsheet)
 */
export async function calculateEVMetricsDaily(
  date: string,
  facilityId: string,
  prefetchedOrders?: import('../types/orders').UniqueOrderStatus[]
): Promise<EVDailySummary> {
  console.log(`Calculating EV metrics daily for ${facilityId} on ${date}...`);

  // Use pre-fetched orders if provided, otherwise read from sheet
  // Filter out duplicates
  const allOrders = prefetchedOrders ?? await getUniqueOrdersForDate(date, facilityId);
  const orders = allOrders.filter((o) => !o.is_duplicate);

  if (orders.length === 0) {
    console.log(`No orders found for ${facilityId} on ${date}, returning zero EV metrics`);
    return {
      created_at_date: date,
      facility_id: facilityId,
      total_orders: 0,
      orders_active: 0,
      orders_inactive: 0,
      orders_unknown: 0,
      ev_completed: 0,
      ev_in_progress: 0,
      ev_error_total: 0,
      ev_error_timeout: 0,
      ev_error_auth: 0,
      ev_error_network: 0,
      ev_error_validation: 0,
      ev_error_type_not_supported: 0,
      ev_error_rate_limit: 0,
      ev_error_other: 0,
      pct_active: 0,
      pct_inactive: 0,
      pct_completed: 0,
      pct_error: 0,
      last_updated_timestamp: toISTTimestamp(new Date()),
    };
  }

  // Coverage counts using normalizeActiveStatus
  const total_orders = orders.length;
  const orders_active = orders.filter((o) => normalizeActiveStatus(o.primary_active) === 'active').length;
  const orders_inactive = orders.filter((o) => normalizeActiveStatus(o.primary_active) === 'inactive').length;
  const orders_unknown = orders.filter(
    (o) => !o.primary_active || normalizeActiveStatus(o.primary_active) === 'unknown'
  ).length;

  // EV service status
  const ev_completed = orders.filter((o) => o.ev_bv_primary === 'completed').length;
  const ev_in_progress = orders.filter((o) => o.ev_bv_primary === 'in_progress').length;

  // Error classification
  const errors = orders.filter((o) => classifyErrorType(o.ev_bv_primary) !== null);
  const ev_error_total = errors.length;
  const ev_error_timeout = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'timeout').length;
  const ev_error_auth = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'auth').length;
  const ev_error_network = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'network').length;
  const ev_error_validation = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'validation').length;
  const ev_error_type_not_supported = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'type_not_supported').length;
  const ev_error_rate_limit = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'rate_limit').length;
  const ev_error_other = errors.filter((o) => classifyErrorType(o.ev_bv_primary) === 'other').length;

  // Calculate percentages
  const pct_active = total_orders > 0 ? (orders_active / total_orders) * 100 : 0;
  const pct_inactive = total_orders > 0 ? (orders_inactive / total_orders) * 100 : 0;
  const pct_completed = total_orders > 0 ? (ev_completed / total_orders) * 100 : 0;
  const pct_error = total_orders > 0 ? (ev_error_total / total_orders) * 100 : 0;

  const metrics: EVDailySummary = {
    created_at_date: date,
    facility_id: facilityId,
    total_orders,
    orders_active,
    orders_inactive,
    orders_unknown,
    ev_completed,
    ev_in_progress,
    ev_error_total,
    ev_error_timeout,
    ev_error_auth,
    ev_error_network,
    ev_error_validation,
    ev_error_type_not_supported,
    ev_error_rate_limit,
    ev_error_other,
    pct_active: Math.round(pct_active * 10) / 10,
    pct_inactive: Math.round(pct_inactive * 10) / 10,
    pct_completed: Math.round(pct_completed * 10) / 10,
    pct_error: Math.round(pct_error * 10) / 10,
    last_updated_timestamp: toISTTimestamp(new Date()),
  };

  console.log(`✅ Calculated EV metrics daily for ${facilityId} on ${date}: ${total_orders} orders`);
  return metrics;
}

/**
 * Fetch orders from data source (in-memory only, no sheet write)
 * Replaces the old syncRawData() which wrote to orders_raw_hourly
 */
async function fetchOrgOrders(
  date: Date,
  facilityId: string,
  facilityName: string
): Promise<{ snapshots: OrderSnapshot[]; algoliaOrders?: AlgoliaOrder[] }> {
  console.log(`[${facilityName}] Fetching orders from data source...`);

  // Fetch orders for this specific facility (uses configured data source: Algolia or Firestore)
  const { snapshots, algoliaOrders } = await fetchOrdersByDate(date, facilityId);

  console.log(`[${facilityName}] Found ${snapshots.length} orders`);

  if (snapshots.length === 0) {
    console.log(`[${facilityName}] No orders found, skipping`);
    return { snapshots: [], algoliaOrders };
  }

  return { snapshots, algoliaOrders };
}

/**
 * LAYER 2: Calculate metrics from snapshots and write to metric sheets
 */
export async function calculateMetricsFromSnapshots(
  snapshots: OrderSnapshot[],
  facilityId: string,
  facilityName: string,
  ordersDate: Date
): Promise<{ orgMetrics: number; personMetrics: number }> {
  if (snapshots.length === 0) {
    return { orgMetrics: 0, personMetrics: 0 };
  }

  const currentTime = new Date(); // Current time when metrics are calculated

  // Calculate and write org metrics
  console.log(`[${facilityName}] Calculating org metrics...`);
  const historicalAvg = 0; // TODO: Calculate from historical data
  const orgMetrics = calculateOrgMetrics(snapshots, facilityId, currentTime, ordersDate, historicalAvg);
  await appendOrgMetrics([orgMetrics]);

  // Calculate and write person metrics
  console.log(`[${facilityName}] Calculating person metrics...`);
  const historicalAvgByPerson = new Map<string, number>(); // TODO: Calculate from historical data
  const personMetrics = calculatePersonMetrics(
    snapshots,
    facilityId,
    currentTime,
    ordersDate,
    historicalAvgByPerson
  );
  await appendPersonMetrics(personMetrics);

  console.log(`[${facilityName}] ✓ Metrics calculated: ${personMetrics.length} providers`);

  return {
    orgMetrics: 1,
    personMetrics: personMetrics.length,
  };
}

/**
 * Sync unique order status (tracks latest state of each order with change detection)
 */
export async function syncUniqueOrdersStatus(
  algoliaOrders: AlgoliaOrder[],
  facilityId: string,
  facilityName: string,
  existingOrderMap?: Map<string, import('../types/orders').UniqueOrderStatus>
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  console.log(`[${facilityName}] Starting unique order status sync for ${algoliaOrders.length} orders...`);

  const startTime = Date.now();
  const syncTimestamp = toISTTimestamp(new Date());

  // Import transformation service (dynamic to avoid circular deps)
  const { transformAlgoliaToUniqueStatus, detectChanges } = await import('./algolia/unique-status-transform.service');
  const { appendOrUpdateUniqueOrderStatus } = await import('./sheets-dual');

  // Use pre-loaded map if provided, otherwise read from sheet
  let existingMap: Map<string, import('../types/orders').UniqueOrderStatus>;
  if (existingOrderMap) {
    existingMap = existingOrderMap;
    console.log(`[${facilityName}] Using pre-loaded order status map (${existingMap.size} orders)`);
  } else {
    const { getExistingOrderStatusMap } = await import('./sheets-dual');
    existingMap = await getExistingOrderStatusMap();
    console.log(`[${facilityName}] Found ${existingMap.size} existing order statuses`);
  }

  // Transform Algolia orders
  const transformedOrders = algoliaOrders.map(order =>
    transformAlgoliaToUniqueStatus(order, syncTimestamp, existingMap.get(order.id || order.order_id))
  );

  // Detect changes
  const { inserts, updates, unchanged } = detectChanges(transformedOrders, existingMap);

  console.log(`[${facilityName}] Changes detected: ${inserts.length} new, ${updates.length} updated, ${unchanged.length} unchanged`);

  // Write only changed orders (inserts + updates)
  const ordersToWrite = [...inserts, ...updates];
  if (ordersToWrite.length > 0) {
    await appendOrUpdateUniqueOrderStatus(ordersToWrite);
    console.log(`[${facilityName}] ✅ Wrote ${ordersToWrite.length} order statuses to sheet`);
  } else {
    console.log(`[${facilityName}] ℹ️  No changes to write`);
  }

  const duration = Date.now() - startTime;
  console.log(`[${facilityName}] ✓ Unique order status sync completed in ${duration}ms`);

  return {
    inserted: inserts.length,
    updated: updates.length,
    unchanged: unchanged.length,
  };
}

/**
 * BATCH SYNC: Fetch each date individually per org, process sequentially
 *
 * Optimizations vs the old sequential syncOrgData() loop:
 * - Accepts pre-loaded existingOrderMap to avoid redundant sheet reads
 * - Skips metric recalculation when syncUniqueOrdersStatus reports 0 changes
 * - Orgs run in parallel (caller uses Promise.all)
 * - Per-date Algolia calls avoid the 5k-hit cap of date-range queries
 */
export async function syncOrgDataBatch(
  dates: string[],
  facilityId: string,
  facilityName: string,
  existingOrderMap: Map<string, import('../types/orders').UniqueOrderStatus>
): Promise<{
  totalOrders: number;
  datesProcessed: number;
  datesSkipped: number;
  totalInserted: number;
  totalUpdated: number;
}> {
  const startTime = Date.now();
  console.log(`[${facilityName}] Batch syncing ${dates.length} date(s)...`);

  if (dates.length === 0) {
    return { totalOrders: 0, datesProcessed: 0, datesSkipped: 0, totalInserted: 0, totalUpdated: 0 };
  }

  const sortedDates = [...dates].sort();
  const { algoliaFetchService } = await import('./algolia/fetch.service');
  const { algoliaTransformService } = await import('./algolia/transform.service');

  let totalOrders = 0;
  let datesProcessed = 0;
  let datesSkipped = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  // Process each date sequentially (per-date Algolia fetch avoids 5k cap)
  for (const dateStr of sortedDates) {
    // Fetch this date's orders from Algolia
    let dateAlgoliaOrders;
    try {
      dateAlgoliaOrders = await algoliaFetchService.fetchOrdersByDate(facilityId, dateStr);
    } catch (error) {
      console.error(`[${facilityName}]   ❌ ${dateStr}: Algolia fetch failed:`, error);
      datesSkipped++;
      continue;
    }
    console.log(`[${facilityName}] Processing ${dateStr}: ${dateAlgoliaOrders.length} orders`);

    if (dateAlgoliaOrders.length === 0) {
      console.log(`[${facilityName}]   ⏭ ${dateStr}: No orders, skipping`);
      datesSkipped++;
      continue;
    }

    totalOrders += dateAlgoliaOrders.length;

    // Step 3a: Transform to snapshots for org/person metrics
    const snapshots = algoliaTransformService.transformOrders(dateAlgoliaOrders);

    // Step 3b: Sync unique order status (pass pre-loaded map)
    let hasChanges = false;
    try {
      const result = await syncUniqueOrdersStatus(dateAlgoliaOrders, facilityId, facilityName, existingOrderMap);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      hasChanges = result.inserted > 0 || result.updated > 0;

      // Update the in-memory map with newly synced orders so subsequent dates see fresh data
      if (hasChanges) {
        const { transformAlgoliaToUniqueStatus } = await import('./algolia/unique-status-transform.service');
        const syncTimestamp = toISTTimestamp(new Date());
        for (const order of dateAlgoliaOrders) {
          const orderId = order.id || order.order_id;
          const transformed = transformAlgoliaToUniqueStatus(order, syncTimestamp, existingOrderMap.get(orderId));
          existingOrderMap.set(orderId, transformed);
        }
      }
    } catch (error) {
      console.error(`[${facilityName}]   ❌ ${dateStr}: Error syncing unique order status:`, error);
    }

    // Step 3c: Calculate org/person metrics from in-memory snapshots
    try {
      await calculateMetricsFromSnapshots(snapshots, facilityId, facilityName, new Date(dateStr));
    } catch (error) {
      console.error(`[${facilityName}]   ⚠️ ${dateStr}: Error calculating snapshot metrics:`, error);
    }

    // Step 3d: Skip downstream metrics if no changes detected
    if (!hasChanges) {
      console.log(`[${facilityName}]   ⏭ ${dateStr}: No status changes, skipping metric recalculation`);
      datesProcessed++;
      continue;
    }

    // Step 3e: Build orders list from the in-memory map for this date+facility
    const ordersForDate = Array.from(existingOrderMap.values()).filter(
      (o) => toISTDate(o.created_at_iso) === dateStr && o.org_id === facilityId
    );

    // Step 3f: Calculate and store business metrics (pass pre-fetched orders)
    try {
      const businessMetrics = await calculateBusinessMetrics(dateStr, facilityId, ordersForDate);
      await appendOrUpdateBusinessMetrics([businessMetrics]);
    } catch (error) {
      console.error(`[${facilityName}]   ⚠️ ${dateStr}: Error calculating business metrics:`, error);
    }

    // Step 3g: Calculate and store EV metrics daily (pass pre-fetched orders)
    try {
      const { appendOrUpdateEVMetricsDaily } = await import('./sheets/techMetricsSheets');
      const evMetrics = await calculateEVMetricsDaily(dateStr, facilityId, ordersForDate);
      await appendOrUpdateEVMetricsDaily([evMetrics]);
    } catch (error) {
      console.error(`[${facilityName}]   ⚠️ ${dateStr}: Error calculating EV metrics daily:`, error);
    }

    // Step 3h: Calculate and store payer treatment aging (pass pre-fetched orders)
    try {
      const { calculatePayerTreatmentAging } = await import('../utils/metrics/payerTreatmentAging');
      const { appendOrUpdatePayerTreatmentAging } = await import('./sheets-dual');
      const payerAgingRows = calculatePayerTreatmentAging(ordersForDate, dateStr, dateStr);
      if (payerAgingRows.length > 0) {
        await appendOrUpdatePayerTreatmentAging(payerAgingRows);
      }
    } catch (error) {
      console.error(`[${facilityName}]   ⚠️ ${dateStr}: Error calculating payer treatment aging:`, error);
    }

    datesProcessed++;
    console.log(`[${facilityName}]   ✓ ${dateStr}`);
  }

  const duration = Date.now() - startTime;
  console.log(`[${facilityName}] ✓ Batch sync completed in ${(duration / 1000).toFixed(1)}s: ${totalOrders} orders across ${datesProcessed} dates (${datesSkipped} skipped)`);

  return { totalOrders, datesProcessed, datesSkipped, totalInserted, totalUpdated };
}

/**
 * FULL SYNC: Fetch orders → unique order status → org/person/daily metrics → business metrics
 * No raw data is written to sheets. All derived metrics flow from in-memory data
 * and unique_orders_status (one row per order, upserted from Algolia).
 */
export async function syncOrgData(
  date: Date,
  facilityId: string,
  facilityName: string
): Promise<{
  snapshots: number;
  orgMetrics: number;
  personMetrics: number;
  uniqueOrderStatus?: { inserted: number; updated: number; unchanged: number };
}> {
  // Step 1: Fetch orders from Algolia (in-memory only, no raw sheet write)
  const { snapshots, algoliaOrders } = await fetchOrgOrders(date, facilityId, facilityName);

  if (snapshots.length === 0) {
    return { snapshots: 0, orgMetrics: 0, personMetrics: 0 };
  }

  // Step 2: Sync unique order status (always-on, upsert to unique_orders_status)
  let uniqueOrderStatus;
  if (algoliaOrders && algoliaOrders.length > 0) {
    uniqueOrderStatus = await syncUniqueOrdersStatus(algoliaOrders, facilityId, facilityName);
  }

  // Step 3: Calculate and write org/person/daily metrics from in-memory snapshots
  const metrics = await calculateMetricsFromSnapshots(snapshots, facilityId, facilityName, date);

  // Step 4: Calculate and store business metrics from unique_orders_status
  try {
    const dateStr = toISTDate(date);
    const businessMetrics = await calculateBusinessMetrics(dateStr, facilityId);
    await appendOrUpdateBusinessMetrics([businessMetrics]);
    console.log(`[${facilityName}] ✅ Business metrics calculated and stored`);
  } catch (error) {
    console.error(`[${facilityName}] ⚠️  Error calculating business metrics:`, error);
    // Non-fatal error - continue sync
  }

  // Step 5: Calculate and store EV metrics daily from unique_orders_status
  try {
    const dateStr = toISTDate(date);
    const { appendOrUpdateEVMetricsDaily } = await import('./sheets/techMetricsSheets');
    const evMetrics = await calculateEVMetricsDaily(dateStr, facilityId);
    await appendOrUpdateEVMetricsDaily([evMetrics]);
    console.log(`[${facilityName}] ✅ EV metrics daily calculated and stored`);
  } catch (error) {
    console.error(`[${facilityName}] ⚠️  Error calculating EV metrics daily:`, error);
    // Non-fatal error - continue sync
  }

  // Step 6: Calculate and store payer treatment aging from unique_orders_status
  try {
    const dateStr = toISTDate(date);
    const { calculatePayerTreatmentAging } = await import('../utils/metrics/payerTreatmentAging');
    const { appendOrUpdatePayerTreatmentAging, getUniqueOrdersForDate } = await import('./sheets-dual');
    const orders = await getUniqueOrdersForDate(dateStr, facilityId);
    const payerAgingRows = calculatePayerTreatmentAging(orders, dateStr, dateStr);
    if (payerAgingRows.length > 0) {
      await appendOrUpdatePayerTreatmentAging(payerAgingRows);
    }
    console.log(`[${facilityName}] ✅ Payer treatment aging calculated and stored (${payerAgingRows.length} rows)`);
  } catch (error) {
    console.error(`[${facilityName}] ⚠️  Error calculating payer treatment aging:`, error);
    // Non-fatal error - continue sync
  }

  console.log(`[${facilityName}] ✓ Full sync completed: ${snapshots.length} orders`);

  return {
    snapshots: snapshots.length,
    ...metrics,
    uniqueOrderStatus,
  };
}

/**
 * Main sync function - fetch data and write to sheets (parallelized by org)
 */
export async function syncOrderData(date: Date = new Date(), force: boolean = false, facilityId?: string): Promise<{ snapshots: number; orgMetrics: number; personMetrics: number }> {
  console.log(`Starting sync for ${format(date, 'yyyy-MM-dd HH:mm')}`);

  // Log data source and spreadsheet configuration
  logCurrentDataSource();
  logSpreadsheetConfig();

  // Check if working day (unless forced)
  if (!force) {
    const isWorking = await isWorkingDay(date);
    if (!isWorking) {
      console.log(`Skipping sync - ${format(date, 'yyyy-MM-dd')} is not a working day`);
      return { snapshots: 0, orgMetrics: 0, personMetrics: 0 };
    }
  }

  try {
    // If specific facility requested, sync only that org
    if (facilityId) {
      const org = ORGANIZATIONS.find((o) => o.facilityId === facilityId);
      if (!org) {
        throw new Error(`Unknown facility ID: ${facilityId}`);
      }

      const result = await syncOrgData(date, org.facilityId, org.name);
      console.log(`Sync completed successfully for ${org.name} at ${format(date, 'yyyy-MM-dd HH:mm')}`);
      return result;
    }

    // Otherwise, sync all orgs in parallel
    console.log(`Syncing ${ORGANIZATIONS.length} organizations in parallel...`);

    const results = await Promise.all(
      ORGANIZATIONS.map((org) => syncOrgData(date, org.facilityId, org.name))
    );

    const totalSnapshots = results.reduce((sum, r) => sum + r.snapshots, 0);
    const totalOrgMetrics = results.reduce((sum, r) => sum + r.orgMetrics, 0);
    const totalPersonMetrics = results.reduce((sum, r) => sum + r.personMetrics, 0);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✓ Sync completed successfully at ${format(date, 'yyyy-MM-dd HH:mm')}`);
    console.log(`  Total: ${totalSnapshots} orders, ${totalOrgMetrics} orgs, ${totalPersonMetrics} providers`);
    console.log(`${'='.repeat(60)}`);

    return {
      snapshots: totalSnapshots,
      orgMetrics: totalOrgMetrics,
      personMetrics: totalPersonMetrics,
    };
  } catch (error) {
    console.error('Error during sync:', error);
    throw error;
  }
}

/**
 * Backfill historical data for multiple dates
 */
export async function backfillHistoricalData(dates: Date[]): Promise<void> {
  console.log(`Backfilling data for ${dates.length} dates...`);

  for (const date of dates) {
    console.log(`\n--- Backfilling ${format(date, 'yyyy-MM-dd')} ---`);
    try {
      await syncOrderData(date);
    } catch (error) {
      console.error(`Failed to backfill ${format(date, 'yyyy-MM-dd')}:`, error);
    }
  }

  console.log('\nBackfill completed');
}
