import 'dotenv/config';
import { subDays, format } from 'date-fns';
import { syncOrderData, backfillHistoricalData } from './services/sync';
import { initializeSheets } from './services/sheets-dual';
import { sendDailySlackAlerts, sendSlackAlertForOrg } from './services/slackAlerts';
import { syncEVMetrics, syncEVMetricsForAllFacilities } from './services/sync/evMetricsSync';
import { syncQueueDataForAllFacilities } from './services/sync/queueSync';
import { migrateToTDualSheets } from './cli-migrate';
import { enforceRetentionPolicy, testRetentionPolicy, getDashboardCellCount } from './services/sheets-retention';
import { checkSheetCapacity } from './services/sheets-monitor';

/**
 * CLI tool for running sync operations
 */

const command = process.argv[2];

async function main() {
  console.log('='.repeat(60));
  console.log('PA Orders Analytics - Data Sync Tool');
  console.log('='.repeat(60));
  console.log('');

  try {
    switch (command) {
      case 'init':
        console.log('Initializing Google Sheets...');
        await initializeSheets();
        console.log('✓ Sheets initialized successfully');
        break;

      case 'sync':
        console.log('Running sync for today...');
        await syncOrderData(new Date());
        console.log('✓ Sync completed');
        break;

      case 'backfill':
        console.log('Backfilling last 5 working days...');
        const dates = [
          subDays(new Date(), 1), // Yesterday (Jan 2)
          subDays(new Date(), 2), // Day before (Jan 1 - holiday, will be skipped)
          subDays(new Date(), 3), // Dec 31
          subDays(new Date(), 4), // Dec 30
          subDays(new Date(), 5), // Dec 29 (weekend, will be skipped)
        ];
        await backfillHistoricalData(dates);
        console.log('✓ Backfill completed');
        break;

      case 'sync-date':
        const dateArg = process.argv[3];
        if (!dateArg) {
          console.error('Error: Please provide a date (YYYY-MM-DD)');
          process.exit(1);
        }
        const targetDate = new Date(dateArg);

        // Parse optional arguments (--force, --org, --facility-id)
        let forceSync = false;
        let facilityId: string | undefined;

        for (let i = 4; i < process.argv.length; i++) {
          if (process.argv[i] === '--force') {
            forceSync = true;
          } else if (process.argv[i] === '--org' && process.argv[i + 1]) {
            // Map org name to facility ID
            const { getOrganizationById } = await import('./config/organizations');
            const orgId = process.argv[i + 1].toLowerCase();
            const org = getOrganizationById(orgId);
            if (!org) {
              console.error(`Error: Unknown organization '${orgId}'. Valid options: nycbs, chc, mbpcc, ucbc`);
              process.exit(1);
            }
            facilityId = org.facilityId;
            console.log(`Syncing only: ${org.name} (${org.facilityId})`);
            i++; // Skip next arg since we consumed it
          } else if (process.argv[i] === '--facility-id' && process.argv[i + 1]) {
            facilityId = process.argv[i + 1];
            i++; // Skip next arg since we consumed it
          }
        }

        console.log(`Running sync for ${format(targetDate, 'yyyy-MM-dd')}...`);

        await syncOrderData(targetDate, forceSync, facilityId);

        console.log('✓ Sync completed');
        break;

      case 'slack-alert':
        const alertDateArg = process.argv[3];
        let alertDate = new Date();
        let alertOrgId: string | undefined;

        // Parse optional date argument
        if (alertDateArg && !alertDateArg.startsWith('--')) {
          alertDate = new Date(alertDateArg);
        }

        // Parse optional --org flag
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i] === '--org' && process.argv[i + 1]) {
            alertOrgId = process.argv[i + 1].toLowerCase();
            break;
          }
        }

        console.log(`Sending Slack alerts for ${format(alertDate, 'yyyy-MM-dd')}...`);

        if (alertOrgId) {
          // Send alert for specific org
          const { getOrganizationById } = await import('./config/organizations');
          const org = getOrganizationById(alertOrgId);
          if (!org) {
            console.error(`Error: Unknown organization '${alertOrgId}'. Valid options: nycbs, chc, mbpcc, ucbc`);
            process.exit(1);
          }
          await sendSlackAlertForOrg(org, alertDate);
        } else {
          // Send alerts for all orgs
          await sendDailySlackAlerts(alertDate);
        }

        console.log('✓ Slack alerts sent');
        break;

      case 'sync-ev-metrics':
        const evDateArg = process.argv[3];
        let evDate = format(new Date(), 'yyyy-MM-dd');
        let evFacilityIds: string[] | undefined;

        // Parse optional date argument
        if (evDateArg && !evDateArg.startsWith('--')) {
          evDate = evDateArg;
        }

        // Parse optional --org flag
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i] === '--org' && process.argv[i + 1]) {
            const orgId = process.argv[i + 1].toUpperCase();
            evFacilityIds = [orgId];
            console.log(`Syncing EV metrics for org: ${orgId}`);
            break;
          }
        }

        console.log(`Syncing EV metrics for ${evDate}...`);

        if (evFacilityIds) {
          await syncEVMetrics(evFacilityIds, evDate);
        } else {
          await syncEVMetricsForAllFacilities(evDate);
        }

        console.log('✓ EV metrics sync completed');
        break;

      case 'sync-queue':
        console.log('Syncing queue data for all facilities...');
        await syncQueueDataForAllFacilities();
        console.log('✓ Queue data sync completed');
        break;

      case 'migrate':
        // Parse --days or --all flag
        let migrateDays: number | undefined;
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i] === '--days' && process.argv[i + 1]) {
            migrateDays = parseInt(process.argv[i + 1], 10);
            break;
          } else if (process.argv[i] === '--all') {
            migrateDays = undefined;
            break;
          }
        }

        if (migrateDays === undefined && !process.argv.includes('--all')) {
          console.error('Error: Please specify --days N or --all');
          console.error('  npm run cli migrate -- --days 7   (Migrate last 7 days)');
          console.error('  npm run cli migrate -- --all      (Migrate ALL data)');
          process.exit(1);
        }

        await migrateToTDualSheets(migrateDays);
        break;

      case 'init-dual-sheets':
        console.log('Initializing dual-spreadsheet architecture...');
        await initializeSheets();
        console.log('✓ Dual spreadsheets initialized successfully');
        break;

      case 'check-capacity':
        console.log('Checking sheet capacity...');
        await checkSheetCapacity();
        console.log('✓ Capacity check completed');
        break;

      case 'test-retention':
        console.log('Testing retention policy (dry-run)...');
        await testRetentionPolicy();
        console.log('✓ Retention policy test completed');
        break;

      case 'run-retention':
        console.log('Running retention policy cleanup...');
        await enforceRetentionPolicy();
        console.log('✓ Retention policy cleanup completed');
        break;

      case 'dashboard-cells':
        console.log('Getting DASHBOARD cell count...');
        const cellCount = await getDashboardCellCount();
        console.log(`\n📊 Total DASHBOARD cells: ${cellCount.toLocaleString()}`);
        console.log(`   Percentage of limit: ${((cellCount / 10_000_000) * 100).toFixed(4)}%`);
        console.log('');
        break;

      case 'init-business-metrics-sheet':
        console.log('Initializing business_metrics_daily sheet...');
        const { initBusinessMetricsSheet } = await import('./scripts/init-business-metrics-sheet');
        await initBusinessMetricsSheet();
        break;

      case 'init-unique-orders-archive-sheet':
        console.log('Initializing unique_orders_archive sheet...');
        const { initUniqueOrdersArchiveSheet } = await import('./scripts/init-unique-orders-archive-sheet');
        await initUniqueOrdersArchiveSheet();
        break;

      case 'backfill-business-metrics':
        console.log('Backfilling business_metrics_daily...');
        const { backfillBusinessMetrics } = await import('./scripts/backfill-business-metrics');

        // Parse optional --days flag
        let backfillDays = 14;
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i].startsWith('--days=')) {
            backfillDays = parseInt(process.argv[i].split('=')[1], 10);
          }
        }

        await backfillBusinessMetrics({ days: backfillDays });
        break;

      case 'test-backfill-single':
        console.log('Running test backfill (1 day, 1 org)...');
        const { testBackfillSingle } = await import('./scripts/test-backfill-single');
        await testBackfillSingle();
        break;

      case 'recalculate-today':
        console.log('Recalculating business metrics for today (all orgs)...');
        const { recalculateSingleDate } = await import('./scripts/recalculate-single-date');
        await recalculateSingleDate();
        break;

      case 'recalculate-date-range':
        console.log('Recalculating business metrics for date range (all orgs)...');
        const { recalculateDateRange } = await import('./scripts/recalculate-date-range');
        await recalculateDateRange();
        break;

      case 'check-unique-orders-data':
        console.log('Checking unique_orders_status data...');
        const { checkUniqueOrdersData } = await import('./scripts/check-unique-orders-data');
        await checkUniqueOrdersData();
        break;

      case 'recreate-business-metrics-sheet':
        console.log('Recreating business_metrics_daily sheet with updated schema...');
        const { recreateBusinessMetricsSheet } = await import('./scripts/recreate-business-metrics-sheet');
        await recreateBusinessMetricsSheet();
        break;

      case 'inspect-unique-orders-fields':
        console.log('Inspecting unique_orders_status field values...');
        const { inspectUniqueOrdersFields } = await import('./scripts/inspect-unique-orders-fields');
        await inspectUniqueOrdersFields();
        break;

      case 'check-business-metrics':
        console.log('Checking business_metrics_daily data...');
        const { checkBusinessMetrics } = await import('./scripts/check-business-metrics');
        await checkBusinessMetrics();
        break;

      case 'check-business-metrics-raw':
        console.log('Checking business_metrics_daily raw data...');
        const { checkBusinessMetricsRaw } = await import('./scripts/check-business-metrics-raw');
        await checkBusinessMetricsRaw();
        break;

      case 'show-raw-algolia':
        console.log('Fetching raw Algolia response...');
        const { showRawAlgoliaResponse } = await import('./scripts/show-raw-algolia-response');
        await showRawAlgoliaResponse();
        break;

      case 'show-auth-status-breakdown':
        console.log('Analyzing auth_status breakdown...');
        const { showAuthStatusBreakdown } = await import('./scripts/show-auth-status-breakdown');
        await showAuthStatusBreakdown();
        break;

      case 'show-complete-auth-table':
        console.log('Generating complete auth_status table...');
        const { showCompleteAuthStatusTable } = await import('./scripts/show-complete-auth-status-table');
        await showCompleteAuthStatusTable();
        break;

      case 'test-bo-count':
        console.log('Testing BO count fetch from Firestore...');
        const { testBoCountFetch } = await import('./scripts/test-bo-count-fetch');
        await testBoCountFetch();
        break;

      case 'add-bo-count-column':
        console.log('Adding bo_count column to unique_orders_status...');
        const { addBoCountColumn } = await import('./scripts/add-bo-count-column');
        await addBoCountColumn();
        break;

      case 'backfill-bo-count':
        console.log('Backfilling BO count from Firestore...');
        const { backfillBoCount } = await import('./scripts/backfill-bo-count');
        await backfillBoCount();
        break;

      case 'backfill-bo-count-range':
        console.log('Backfilling BO count for date range...');
        const { backfillBoCountRange } = await import('./scripts/backfill-bo-count-range');
        await backfillBoCountRange();
        break;

      case 'check-missing-bo-count':
        console.log('Checking for missing bo_count values...');
        const { checkMissingBoCount } = await import('./scripts/check-missing-bo-count');
        await checkMissingBoCount();
        break;

      case 'backfill-all-missing-bo-count':
        console.log('Backfilling ALL missing bo_count values...');
        const { backfillAllMissingBoCount } = await import('./scripts/backfill-all-missing-bo-count');
        await backfillAllMissingBoCount();
        break;

      case 'refetch-all-bo-count':
        console.log('Re-fetching ALL bo_count values from Firestore...');
        const { refetchAllBoCount } = await import('./scripts/refetch-all-bo-count');
        await refetchAllBoCount();
        break;

      case 'backfill-mrn':
        console.log('Backfilling patient MRN from Algolia...');
        const { backfillMrn } = await import('./scripts/backfill-mrn');
        await backfillMrn();
        break;

      case 'detect-duplicates':
        console.log('Detecting and marking duplicate orders...');
        const { detectDuplicates } = await import('./scripts/detect-duplicates');
        await detectDuplicates();
        break;

      case 'l0-business-output':
        console.log('Sending Daily Orders Billed...');
        const { sendL0BusinessOutputAlert } = await import('./alerts/l0-business-output-alert');
        await sendL0BusinessOutputAlert();
        break;

      case 'payer-aging-init':
        console.log('Initializing payer_treatment_aging sheet...');
        const { initPayerTreatmentAgingSheet } = await import('./scripts/init-payer-treatment-aging-sheet');
        await initPayerTreatmentAgingSheet();
        break;

      case 'payer-aging-backfill': {
        console.log('Backfilling payer_treatment_aging...');
        const { backfillPayerTreatmentAging } = await import('./scripts/backfill-payer-treatment-aging');

        let payerBackfillDays = 30;
        let payerStartDate: string | undefined;
        let payerEndDate: string | undefined;
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i].startsWith('--days=')) {
            payerBackfillDays = parseInt(process.argv[i].split('=')[1], 10);
          } else if (process.argv[i].startsWith('--start=')) {
            payerStartDate = process.argv[i].split('=')[1];
          } else if (process.argv[i].startsWith('--end=')) {
            payerEndDate = process.argv[i].split('=')[1];
          }
        }

        await backfillPayerTreatmentAging(
          payerStartDate && payerEndDate
            ? { startDate: payerStartDate, endDate: payerEndDate }
            : { days: payerBackfillDays }
        );
        break;
      }

      case 'dos-coverage-alert':
        console.log('Sending DoS Coverage...');
        const { sendDosCoverageAlert } = await import('./alerts/dos-coverage-alert');
        await sendDosCoverageAlert();
        break;

      case 'future-dos-alert':
        console.log('Sending Future DOS Open Orders (NYCBS)...');
        const { sendFutureDosOpenOrdersAlert } = await import('./alerts/future-dos-open-orders-alert');
        await sendFutureDosOpenOrdersAlert();
        break;

      case 'approval-rate-trending':
        console.log('Sending Approval Rate...');
        const { sendApprovalRateTrendingAlert } = await import('./alerts/approval-rate-trending-alert');
        await sendApprovalRateTrendingAlert();
        break;

      case 'open-orders-refresh': {
        const refreshStartTime = Date.now();
        console.log('Running open orders re-sync (batched)...');
        const { getExistingOrderStatusMap } = await import('./services/sheets-dual');
        const { syncOrgDataBatch } = await import('./services/sync');
        const { getOrganizationByFacilityId } = await import('./config/organizations');
        const { MEDICAL_ORDER_STATUS } = await import('./types/agentModeMetrics');
        const { toISTDate } = await import('./utils/timezone');

        // Parse --org filter (comma-separated org IDs)
        let orgFilter: Set<string> | undefined;
        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i] === '--org' && process.argv[i + 1]) {
            const { getOrganizationById } = await import('./config/organizations');
            const orgIds = process.argv[i + 1].toLowerCase().split(',');
            orgFilter = new Set<string>();
            for (const orgId of orgIds) {
              const org = getOrganizationById(orgId.trim());
              if (!org) {
                console.error(`Error: Unknown organization '${orgId.trim()}'. Valid options: nycbs, chc, mbpcc, ucbc, sunstate`);
                process.exit(1);
              }
              orgFilter.add(org.facilityId);
            }
            console.log(`Filtering to orgs: ${orgIds.join(', ')}`);
            break;
          }
        }

        // Single sheet read for all orgs
        const orderMap = await getExistingOrderStatusMap();
        console.log(`Read ${orderMap.size} total orders from unique_orders_status`);

        const completedStatuses = new Set([
          MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT,
          MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN,
        ]);

        // Build org → dates map from open orders
        const orgDateMap = new Map<string, Set<string>>();
        let openOrderCount = 0;

        Array.from(orderMap.values()).forEach((order) => {
          if (order.medical_order_status && completedStatuses.has(order.medical_order_status as any)) {
            return;
          }
          openOrderCount++;

          const facilityId = order.org_id;
          const dateStr = toISTDate(order.created_at_iso);

          if (!orgDateMap.has(facilityId)) {
            orgDateMap.set(facilityId, new Set());
          }
          orgDateMap.get(facilityId)!.add(dateStr);
        });

        console.log(`Found ${openOrderCount} open orders across ${orgDateMap.size} orgs`);

        if (orgDateMap.size === 0) {
          console.log('No open orders found — nothing to re-sync');
          break;
        }

        // Apply --org filter
        let entries = Array.from(orgDateMap.entries());
        if (orgFilter) {
          entries = entries.filter(([facilityId]) => orgFilter!.has(facilityId));
          if (entries.length === 0) {
            console.log('No open orders found for the specified org(s) — nothing to re-sync');
            break;
          }
        }

        // Log what we're about to do
        for (const [facilityId, dates] of entries) {
          const org = getOrganizationByFacilityId(facilityId);
          const facilityName = org?.name ?? facilityId;
          console.log(`🔄 ${facilityName}: ${dates.size} date(s) to re-sync`);
        }

        // Process all orgs in parallel — each org does a single Algolia date-range fetch
        // and processes dates sequentially within the org (avoids Sheets write contention)
        const results = await Promise.all(
          entries.map(async ([facilityId, dates]) => {
            const org = getOrganizationByFacilityId(facilityId);
            const facilityName = org?.name ?? facilityId;
            try {
              const result = await syncOrgDataBatch(
                Array.from(dates),
                facilityId,
                facilityName,
                orderMap
              );
              return { facilityName, dates: dates.size, ...result, error: null };
            } catch (error) {
              console.error(`❌ ${facilityName}: batch sync failed:`, error);
              return { facilityName, dates: dates.size, totalOrders: 0, datesProcessed: 0, datesSkipped: 0, totalInserted: 0, totalUpdated: 0, error };
            }
          })
        );

        // Print summary
        const totalDuration = ((Date.now() - refreshStartTime) / 1000).toFixed(1);
        console.log('\n📋 Summary:');
        for (const r of results) {
          const status = r.error ? '❌ FAILED' : '✓';
          console.log(`   ${status} ${r.facilityName}: ${r.datesProcessed}/${r.dates} date(s), ${r.totalOrders} orders, ${r.totalInserted} new, ${r.totalUpdated} updated`);
        }
        console.log(`\n✓ Open orders re-sync completed in ${totalDuration}s`);

        // Run duplicate detection after sync
        console.log('\n🔍 Running duplicate detection...');
        const { detectDuplicates: detectDupsRefresh } = await import('./scripts/detect-duplicates');
        await detectDupsRefresh();

        // Send Slack notification
        try {
          const { SlackConfig } = await import('./alerts/config/slack.config');
          const { WebClient } = await import('@slack/web-api');
          const web = new WebClient(SlackConfig.getBotToken());

          const orgLines = results.map((r) => {
            const status = r.error ? '❌' : '✅';
            return `• ${status} *${r.facilityName}*: ${r.datesProcessed}/${r.dates} dates | ${r.totalOrders} orders | ${r.totalInserted} new, ${r.totalUpdated} updated`;
          });

          const message = [
            `🔄 *Open Orders Refresh Complete* — ${totalDuration}s`,
            ``,
            ...orgLines,
          ].join('\n');

          await web.chat.postMessage({ channel: SlackConfig.getDefaultChannelId(), text: message });
          console.log('📢 Slack notification sent');
        } catch (slackError) {
          console.error('⚠️  Failed to send Slack notification:', slackError);
        }

        break;
      }

      case 'bulk-refresh': {
        const bulkStartTime = Date.now();
        console.log('Running bulk refresh (batched, parallel by org)...');

        // Parse required --start and --end dates
        let bulkStart: string | undefined;
        let bulkEnd: string | undefined;
        let bulkOrgFilter: Set<string> | undefined;

        for (let i = 3; i < process.argv.length; i++) {
          if (process.argv[i] === '--start' && process.argv[i + 1]) {
            bulkStart = process.argv[i + 1];
            i++;
          } else if (process.argv[i] === '--end' && process.argv[i + 1]) {
            bulkEnd = process.argv[i + 1];
            i++;
          } else if (process.argv[i] === '--org' && process.argv[i + 1]) {
            const { getOrganizationById } = await import('./config/organizations');
            const orgIds = process.argv[i + 1].toLowerCase().split(',');
            bulkOrgFilter = new Set<string>();
            for (const orgId of orgIds) {
              const org = getOrganizationById(orgId.trim());
              if (!org) {
                console.error(`Error: Unknown organization '${orgId.trim()}'. Valid options: nycbs, chc, mbpcc, ucbc, sunstate`);
                process.exit(1);
              }
              bulkOrgFilter.add(org.facilityId);
            }
            console.log(`Filtering to orgs: ${orgIds.join(', ')}`);
            i++;
          }
        }

        if (!bulkStart || !bulkEnd) {
          console.error('Error: --start and --end are required');
          console.error('Usage: npm run cli bulk-refresh -- --start 2026-01-01 --end 2026-02-09');
          console.error('       npm run cli bulk-refresh -- --start 2026-01-01 --end 2026-02-09 --org chc,ucbc');
          process.exit(1);
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(bulkStart) || !/^\d{4}-\d{2}-\d{2}$/.test(bulkEnd)) {
          console.error('Error: Dates must be in YYYY-MM-DD format');
          process.exit(1);
        }

        // Generate all dates in range
        const bulkDates: string[] = [];
        const current = new Date(bulkStart);
        const end = new Date(bulkEnd);
        if (current > end) {
          console.error('Error: --start must be before or equal to --end');
          process.exit(1);
        }
        while (current <= end) {
          bulkDates.push(format(current, 'yyyy-MM-dd'));
          current.setDate(current.getDate() + 1);
        }

        // Select orgs
        const { ORGANIZATIONS: BULK_ORGS } = await import('./config/organizations');
        let selectedOrgs = BULK_ORGS;
        if (bulkOrgFilter) {
          selectedOrgs = BULK_ORGS.filter((o) => bulkOrgFilter!.has(o.facilityId));
        }

        console.log(`Date range: ${bulkStart} to ${bulkEnd} (${bulkDates.length} days)`);
        console.log(`Organizations: ${selectedOrgs.map((o) => o.name).join(', ')} (${selectedOrgs.length})`);
        console.log(`Total: ${bulkDates.length} dates × ${selectedOrgs.length} orgs = ${bulkDates.length * selectedOrgs.length} combos\n`);

        // Single sheet read
        const { getExistingOrderStatusMap: getBulkOrderMap } = await import('./services/sheets-dual');
        const bulkOrderMap = await getBulkOrderMap();
        console.log(`Read ${bulkOrderMap.size} total orders from unique_orders_status\n`);

        // Process all orgs in parallel, each with a single Algolia date-range call
        const { syncOrgDataBatch: bulkSyncBatch } = await import('./services/sync');

        const bulkResults = await Promise.all(
          selectedOrgs.map(async (org) => {
            try {
              const result = await bulkSyncBatch(
                bulkDates,
                org.facilityId,
                org.name,
                bulkOrderMap
              );
              return { facilityName: org.name, dates: bulkDates.length, ...result, error: null };
            } catch (error) {
              console.error(`❌ ${org.name}: bulk refresh failed:`, error);
              return { facilityName: org.name, dates: bulkDates.length, totalOrders: 0, datesProcessed: 0, datesSkipped: 0, totalInserted: 0, totalUpdated: 0, error };
            }
          })
        );

        // Print summary
        const bulkDuration = ((Date.now() - bulkStartTime) / 1000).toFixed(1);
        const totalBulkOrders = bulkResults.reduce((s, r) => s + r.totalOrders, 0);
        const totalBulkInserted = bulkResults.reduce((s, r) => s + r.totalInserted, 0);
        const totalBulkUpdated = bulkResults.reduce((s, r) => s + r.totalUpdated, 0);

        console.log('\n📋 Bulk Refresh Summary:');
        console.log(`   Date range: ${bulkStart} to ${bulkEnd} (${bulkDates.length} days)`);
        for (const r of bulkResults) {
          const status = r.error ? '❌ FAILED' : '✓';
          console.log(`   ${status} ${r.facilityName}: ${r.datesProcessed}/${r.dates} date(s), ${r.totalOrders} orders, ${r.totalInserted} new, ${r.totalUpdated} updated`);
        }
        console.log(`\n   Totals: ${totalBulkOrders} orders, ${totalBulkInserted} new, ${totalBulkUpdated} updated`);
        console.log(`\n✓ Bulk refresh completed in ${bulkDuration}s`);

        // Run duplicate detection after sync
        console.log('\n🔍 Running duplicate detection...');
        const { detectDuplicates } = await import('./scripts/detect-duplicates');
        await detectDuplicates();

        // Send Slack notification
        try {
          const { SlackConfig } = await import('./alerts/config/slack.config');
          const { WebClient } = await import('@slack/web-api');
          const web = new WebClient(SlackConfig.getBotToken());

          const bulkOrgLines = bulkResults.map((r) => {
            const status = r.error ? '❌' : '✅';
            return `• ${status} *${r.facilityName}*: ${r.datesProcessed}/${r.dates} dates | ${r.totalOrders} orders | ${r.totalInserted} new, ${r.totalUpdated} updated`;
          });

          const message = [
            `🚀 *Bulk Refresh Complete* — ${bulkStart} to ${bulkEnd} (${bulkDates.length} days) in ${bulkDuration}s`,
            ``,
            ...bulkOrgLines,
            ``,
            `*Totals:* ${totalBulkOrders} orders | ${totalBulkInserted} new | ${totalBulkUpdated} updated`,
          ].join('\n');

          await web.chat.postMessage({ channel: SlackConfig.getDefaultChannelId(), text: message });
          console.log('📢 Slack notification sent');
        } catch (slackError) {
          console.error('⚠️  Failed to send Slack notification:', slackError);
        }

        break;
      }

      default:
        console.log('Usage:');
        console.log('');
        console.log('📊 Data Sync Commands:');
        console.log('  npm run cli init          - Initialize Google Sheets with headers (DEPRECATED: use init-dual-sheets)');
        console.log('  npm run cli sync          - Sync data for today');
        console.log('  npm run cli backfill      - Backfill last 5 working days');
        console.log('  npm run cli sync-date <date> [options] - Sync specific date');
        console.log('  npm run cli sync-ev-metrics [date] [options] - Sync EV metrics (default: today)');
        console.log('  npm run cli sync-queue    - Sync queue data for all facilities');
        console.log('  npm run cli slack-alert [date] [options] - Send Slack alerts (default: today)');
        console.log('');
        console.log('🔧 Dual-Spreadsheet Migration Commands (NEW):');
        console.log('  npm run cli migrate -- --days 7       - Migrate last 7 days to dual-spreadsheet');
        console.log('  npm run cli migrate -- --all          - Migrate ALL data to dual-spreadsheet');
        console.log('  npm run cli init-dual-sheets          - Initialize dual-spreadsheet headers');
        console.log('  npm run cli check-capacity            - Check cell capacity for both sheets');
        console.log('  npm run cli test-retention            - Test retention policy (dry-run)');
        console.log('  npm run cli run-retention             - Run retention policy cleanup');
        console.log('  npm run cli dashboard-cells           - Get DASHBOARD cell count');
        console.log('');
        console.log('📈 Business Metrics Commands (NEW):');
        console.log('  npm run cli init-business-metrics-sheet         - Initialize business_metrics_daily sheet');
        console.log('  npm run cli init-unique-orders-archive-sheet    - Initialize unique_orders_archive sheet');
        console.log('  npm run cli backfill-business-metrics [--days=14] - Backfill business metrics (default: 14 days)');
        console.log('  npm run cli backfill-bo-count <date> [--org <org>] - Backfill BO count for single date (e.g., 2026-02-03)');
        console.log('  npm run cli backfill-bo-count-range [--days 14] - Backfill BO count for date range (default: 14 days)');
        console.log('  npm run cli refetch-all-bo-count                 - Re-fetch bo_count from Firestore for ALL orders');
        console.log('  npm run cli backfill-mrn                         - Backfill patient MRN from Algolia for ALL orders');
        console.log('  npm run cli backfill-mrn -- --org nycbs,chc      - Backfill MRN for specific orgs only');
        console.log('  npm run cli detect-duplicates                    - Detect & mark duplicate orders in column AQ');
        console.log('  npm run cli detect-duplicates -- --dry-run       - Preview duplicates without writing');
        console.log('  npm run cli detect-duplicates -- --org nycbs     - Detect duplicates for specific orgs only');
        console.log('  npm run cli test-bo-count                       - Test BO count fetch from Firestore');
        console.log('');
        console.log('📊 DOS Coverage Commands:');
        console.log('  npm run cli payer-aging-init                    - Initialize payer_treatment_aging sheet');
        console.log('  npm run cli payer-aging-backfill [--days=30]    - Backfill payer treatment aging (default: 30 days)');
        console.log('  npm run cli dos-coverage-alert                  - Send DoS Coverage to Slack');
        console.log('');
        console.log('📢 Slack Alert Commands:');
        console.log('  npm run cli l0-business-output                  - Send Daily Orders Billed (last 7 working days)');
        console.log('  npm run cli approval-rate-trending              - Send Approval Rate to Slack');
        console.log('  npm run cli future-dos-alert                    - Send Future DOS Open Orders by assignee (NYCBS → test channel)');
        console.log('');
        console.log('🔄 Open Orders Re-Sync:');
        console.log('  npm run cli open-orders-refresh                 - Re-sync orgs/dates with open orders (batched, parallel)');
        console.log('  npm run cli open-orders-refresh -- --org chc,ucbc  - Re-sync only specific orgs (comma-separated)');
        console.log('');
        console.log('🚀 Bulk Refresh (fast date-range recalculation):');
        console.log('  npm run cli bulk-refresh -- --start 2026-01-01 --end 2026-02-09');
        console.log('  npm run cli bulk-refresh -- --start 2026-01-01 --end 2026-02-09 --org chc,ucbc');
        console.log('');
        console.log('Options:');
        console.log('  --force              - Force sync even on non-working days');
        console.log('  --org <org>          - Sync only specific organization (nycbs, chc, mbpcc, ucbc)');
        console.log('');
        console.log('Examples:');
        console.log('  npm run cli sync-date 2026-01-03');
        console.log('  npm run cli sync-date 2026-01-03 -- --force');
        console.log('  npm run cli sync-date 2026-01-03 -- --force --org chc');
        console.log('  npm run cli sync-date 2026-01-03 -- --org mbpcc');
        console.log('  npm run cli backfill');
        console.log('  npm run cli sync-ev-metrics                   # Sync EV metrics for today (all orgs)');
        console.log('  npm run cli sync-ev-metrics 2026-01-18        # Sync EV metrics for specific date');
        console.log('  npm run cli sync-ev-metrics -- --org NYCBS    # Sync EV metrics for NYCBS only (today)');
        console.log('  npm run cli sync-queue                        # Sync queue data for all facilities');
        console.log('  npm run cli slack-alert                       # Send alerts for today (all orgs)');
        console.log('  npm run cli slack-alert 2026-01-03            # Send alerts for specific date');
        console.log('  npm run cli slack-alert -- --org chc          # Send alert for CHC only (today)');
        console.log('  npm run cli slack-alert 2026-01-03 -- --org nycbs  # Send alert for NYCBS on specific date');
        break;
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
