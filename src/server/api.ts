// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import type { OrgMetrics, PersonMetrics } from '../types/orders';
import { syncOrderData } from '../services/sync';
import { getLastSyncInfo, recordSyncStart, recordSyncComplete, recordSyncFailure, getLatestPersonMetrics, getWorkingDaysInRange, getPersonMetricsForDateRange, setWorkingDayConfig, getBusinessMetricsForRange, appendQueueDailyLog, getLatestFromQueueDailyLog } from '../services/sheets-dual';
import { aggregateDailySummaries, filterByWorkingDays, calculateApprovalRate, calculateAuthorizationRate } from '../utils/businessMetrics';
import { calculateActiveProviders, calculateOrdersPerPerson, calculateRollingAverage, calculateVariance, determinePerformanceStatus } from '../utils/personMetrics';
import { calculateMonitoringTables } from '../utils/monitoringMetrics';
import { ORGANIZATIONS } from '../config/organizations';
import type { PersonQueueSnapshot } from '../types/queue';
import { TEAM_MEMBERS } from '../config/team-members';
import type { PersonPerformanceSummary, DailyPersonPerformance, StatusBreakdown } from '../types/people';
import { authMiddleware } from './auth-middleware';
import { billingAnalyticsRouter } from './billing-analytics.routes';
import type { AgentModeMetricsFilters, AgentModeMetricsData, AllOrdersDailyTrend, NARAgentDailyTrend, NARAgentReviewDaily } from '../types/agentModeMetrics';
import { calculateAgentModeMetrics, filterOrders } from '../utils/metrics/agentModeMetrics';
import { NAR_AUTH_STATUS, MEDICAL_ORDER_STATUS, MEDICAL_ORDER_REVIEW_STATUS } from '../types/agentModeMetrics';
import { calculateDosCoverage } from '../utils/metrics/dosCoverage';
import { calculatePayerTreatmentAging } from '../utils/metrics/payerTreatmentAging';
import { getExistingOrderStatusMap, getOrdersForAgentModeMetrics } from '../services/sheets-dual';
import type { UniqueOrderStatus } from '../types/orders';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Protect all /api routes with authentication
app.use('/api', authMiddleware);

// Mount billing analytics routes
app.use('/api/billing-analytics', billingAnalyticsRouter);

// Environment variables
const SHEETS_ID = process.env.VITE_GOOGLE_SHEETS_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Log environment check (without exposing sensitive data)
if (!SHEETS_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
  console.error('Missing required environment variables:');
  console.error('SHEETS_ID:', SHEETS_ID ? 'present' : 'MISSING');
  console.error('SERVICE_ACCOUNT_EMAIL:', SERVICE_ACCOUNT_EMAIL ? 'present' : 'MISSING');
  console.error('PRIVATE_KEY:', PRIVATE_KEY ? 'present' : 'MISSING');
}

// Sheet names
const SHEET_NAMES = {
  ORG_METRICS: 'org_hourly_metrics',
  PERSON_METRICS: 'person_hourly_performance',
};

/**
 * Initialize Google Sheets API client with caching and timeout configuration
 */
let cachedSheetsClient: ReturnType<typeof google.sheets> | null = null;
let authClient: any = null;
let authInitialized = false;

async function initializeAuth() {
  if (authInitialized && authClient) {
    return authClient;
  }

  console.log('Initializing Google Auth client...');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    clientOptions: {
      // Increased timeout for slow networks
      timeout: 120000, // 120 seconds
    },
  });

  try {
    // Pre-authenticate to get and cache the token
    authClient = await auth.getClient();
    authInitialized = true;
    console.log('Google Auth client initialized successfully');
    return authClient;
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
    throw error;
  }
}

function getSheetsClient() {
  if (!cachedSheetsClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: SERVICE_ACCOUNT_EMAIL,
        private_key: PRIVATE_KEY,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      clientOptions: {
        // Increased timeout for slow networks
        timeout: 120000, // 120 seconds
      },
    });

    cachedSheetsClient = google.sheets({
      version: 'v4',
      auth,
      // Add retry configuration
      retryConfig: {
        retry: 3,
        retryDelay: 2000,
        statusCodesToRetry: [[100, 199], [429, 429], [500, 599]],
      },
    });
  }

  return cachedSheetsClient;
}

/**
 * API: Fetch latest org metrics for a facility and date
 */
app.get('/api/org-metrics/latest', async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ error: 'facilityId and date are required' });
    }

    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${SHEET_NAMES.ORG_METRICS}!A:M`,
    });

    const rows = response.data.values || [];
    let latestMetric: OrgMetrics | null = null;
    let latestTimestamp = '';

    // Skip header row, find latest snapshot for facility and date
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowFacilityId = row[3];
      const rowDate = row[2];

      if (rowFacilityId === facilityId && rowDate === date) {
        const timestamp = row[0];
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
          latestMetric = {
            snapshot_timestamp: row[0],
            snapshot_hour_ist: row[1],
            created_at_date: row[2],
            facility_id: row[3],
            orders_loaded_today: parseInt(row[4]) || 0,
            orders_assigned: parseInt(row[5]) || 0,
            orders_worked: parseInt(row[6]) || 0,
            orders_not_worked_assigned: parseInt(row[7]) || 0,
            work_rate_pct: parseFloat(row[8]) || 0,
            avg_worked_last_7_working_days: parseFloat(row[9]) || 0,
            pace_vs_avg: parseFloat(row[10]) || 0,
            pace_status: (row[11] as 'AHEAD' | 'ON_PACE' | 'BEHIND') || 'ON_PACE',
            projected_eod_worked: parseInt(row[12]) || 0,
          };
        }
      }
    }

    res.json(latestMetric);
  } catch (error: any) {
    console.error('Error fetching latest org metrics:', error);

    // Handle specific error types
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      return res.status(504).json({
        error: 'Request timeout while connecting to Google Sheets API',
        details: 'The server took too long to respond. Please try again.'
      });
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Unable to connect to Google Sheets API',
        details: 'Network connection error. Please check your internet connection.'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch org metrics',
      details: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * API: Fetch hourly org metrics for a facility and date
 */
app.get('/api/org-metrics/hourly', async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ error: 'facilityId and date are required' });
    }

    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${SHEET_NAMES.ORG_METRICS}!A:M`,
    });

    const rows = response.data.values || [];
    const metrics: OrgMetrics[] = [];
    const hourMap = new Map<string, OrgMetrics>();

    // Skip header row, collect metrics for facility and date
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowFacilityId = row[3];
      const rowDate = row[2];
      const hour = row[1];

      if (rowFacilityId === facilityId && rowDate === date) {
        const timestamp = row[0];
        const existing = hourMap.get(hour);

        // Keep the latest snapshot for each hour
        if (!existing || timestamp > existing.snapshot_timestamp) {
          hourMap.set(hour, {
            snapshot_timestamp: row[0],
            snapshot_hour_ist: row[1],
            created_at_date: row[2],
            facility_id: row[3],
            orders_loaded_today: parseInt(row[4]) || 0,
            orders_assigned: parseInt(row[5]) || 0,
            orders_worked: parseInt(row[6]) || 0,
            orders_not_worked_assigned: parseInt(row[7]) || 0,
            work_rate_pct: parseFloat(row[8]) || 0,
            avg_worked_last_7_working_days: parseFloat(row[9]) || 0,
            pace_vs_avg: parseFloat(row[10]) || 0,
            pace_status: (row[11] as 'AHEAD' | 'ON_PACE' | 'BEHIND') || 'ON_PACE',
            projected_eod_worked: parseInt(row[12]) || 0,
          });
        }
      }
    }

    // Convert map to array
    metrics.push(...hourMap.values());

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching hourly org metrics:', error);
    res.status(500).json({ error: 'Failed to fetch hourly org metrics' });
  }
});

/**
 * API: Fetch latest person metrics for a facility and date
 */
app.get('/api/person-metrics/latest', async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ error: 'facilityId and date are required' });
    }

    // Use shared function from sheets.ts
    const metrics = await getLatestPersonMetrics(date as string, facilityId as string);

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching person metrics:', error);
    res.status(500).json({ error: 'Failed to fetch person metrics' });
  }
});

/**
 * API: Trigger a fresh sync for a facility and date
 */
app.post('/api/sync/trigger', async (req, res) => {
  try {
    const { facilityId, date, force = false } = req.body;

    if (!facilityId || !date) {
      return res.status(400).json({
        success: false,
        error: 'facilityId and date are required'
      });
    }

    // Check last sync time and cooldown (unless forced)
    if (!force) {
      const lastSync = await getLastSyncInfo(facilityId, date);

      if (lastSync) {
        const cooldownMs = 60 * 60 * 1000; // 60 minutes in milliseconds
        const lastSyncTime = new Date(lastSync.sync_end_timestamp || lastSync.sync_start_timestamp).getTime();
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTime;

        // Check if sync is currently in progress
        if (lastSync.status === 'in_progress') {
          const syncAge = now - new Date(lastSync.sync_start_timestamp).getTime();

          // If sync is less than 10 minutes old, consider it still running
          if (syncAge < 10 * 60 * 1000) {
            return res.status(409).json({
              success: false,
              message: 'Sync already in progress',
              error: 'A sync operation is already running for this facility and date'
            });
          }
          // If sync is older than 10 minutes, assume it crashed and allow new sync
          console.log(`Stale sync detected (${Math.floor(syncAge / 1000 / 60)} minutes old), allowing new sync`);
        }

        // Check cooldown for completed/failed syncs
        if (lastSync.status !== 'in_progress' && timeSinceLastSync < cooldownMs) {
          const cooldownRemaining = Math.ceil((cooldownMs - timeSinceLastSync) / 1000 / 60);
          const cooldownUntil = new Date(lastSyncTime + cooldownMs).toISOString();

          return res.status(429).json({
            success: false,
            message: `Please wait ${cooldownRemaining} minutes before syncing again`,
            cooldownUntil,
            error: `Cooldown in effect. Next sync available in ${cooldownRemaining} minutes`
          });
        }
      }
    } else {
      console.log(`Force sync requested - bypassing cooldown checks for ${facilityId} on ${date}`);
    }

    // Mark this date as a working day (since user explicitly triggered sync)
    // This allows the sync to proceed even if it's a weekend/holiday
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    await setWorkingDayConfig(
      date,
      true,
      'manual_sync',
      `Manually triggered from UI on ${dayOfWeek}`
    );
    console.log(`Marked ${date} as working day (manual trigger from UI)`);

    // Record sync start
    await recordSyncStart(facilityId, date);

    // Trigger the sync operation (run asynchronously)
    console.log(`Starting sync for facility ${facilityId} on ${date}${force ? ' (FORCED)' : ''}...`);

    // Run sync in background
    syncOrderData(new Date(date), force, facilityId)
      .then((result) => {
        const recordCount = result.snapshots || 0;
        recordSyncComplete(facilityId, date, recordCount);
        console.log(`Sync completed for ${facilityId} on ${date}: ${recordCount} records`);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        recordSyncFailure(facilityId, date, errorMessage);
        console.error(`Sync failed for ${facilityId} on ${date}:`, errorMessage);
      });

    // Return success immediately (sync runs in background)
    res.json({
      success: true,
      message: 'Sync started successfully'
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger sync',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * API: Check sync status for a facility and date
 */
app.get('/api/sync/status', async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ error: 'facilityId and date are required' });
    }

    const lastSync = await getLastSyncInfo(facilityId as string, date as string);

    if (!lastSync) {
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress: false
      });
    }

    let isInProgress = lastSync.status === 'in_progress';
    const lastSyncTimestamp = lastSync.sync_end_timestamp || lastSync.sync_start_timestamp;

    // Check for stale in_progress syncs (older than 10 minutes)
    // Note: Timestamps are stored in IST format (YYYY-MM-DD HH:mm:ss)
    const now = Date.now();

    // Parse IST timestamp and convert to UTC - with validation
    const istTimestamp = lastSync.sync_start_timestamp;

    // Validate timestamp before parsing
    if (!istTimestamp || istTimestamp.trim() === '') {
      console.warn(`[Sync Status] Empty or missing sync_start_timestamp for ${facilityId} on ${date}`);
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress: false
      });
    }

    const parts = istTimestamp.split(' ');
    if (parts.length !== 2) {
      console.error(`[Sync Status] Invalid timestamp format: ${istTimestamp}`);
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress: false
      });
    }

    const [datePart, timePart] = parts;
    const syncStartTime = new Date(`${datePart}T${timePart}+05:30`).getTime(); // IST is UTC+5:30

    // Validate parsed date
    if (isNaN(syncStartTime)) {
      console.error(`[Sync Status] Failed to parse timestamp: ${istTimestamp}`);
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress: false
      });
    }

    const timeSinceStart = now - syncStartTime;
    const staleThreshold = 3 * 60 * 1000; // 3 minutes (lowered from 10 to clear stuck syncs faster)

    console.log(`[Stale Check] Facility: ${facilityId}, IST Timestamp: ${istTimestamp}, Parsed: ${syncStartTime}, Now: ${now}, TimeSince: ${timeSinceStart}ms (${Math.round(timeSinceStart / 60000)}min), Threshold: ${staleThreshold}ms, IsStale: ${timeSinceStart > staleThreshold}`);

    if (isInProgress && timeSinceStart > staleThreshold) {
      // Treat stale in_progress as completed/failed
      console.log(`Detected stale sync for ${facilityId} on ${date} - treating as not in progress`);
      isInProgress = false;
    }

    // Calculate cooldown remaining
    const cooldownMs = 60 * 60 * 1000; // 60 minutes

    // Parse IST timestamp for cooldown calculation - with validation
    if (!lastSyncTimestamp || lastSyncTimestamp.trim() === '') {
      // No valid last sync timestamp, no cooldown
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress
      });
    }

    const cooldownParts = lastSyncTimestamp.split(' ');
    if (cooldownParts.length !== 2) {
      console.error(`[Sync Status] Invalid last sync timestamp format: ${lastSyncTimestamp}`);
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress
      });
    }

    const [cooldownDatePart, cooldownTimePart] = cooldownParts;
    const lastSyncTime = new Date(`${cooldownDatePart}T${cooldownTimePart}+05:30`).getTime();

    // Validate parsed date
    if (isNaN(lastSyncTime)) {
      console.error(`[Sync Status] Failed to parse last sync timestamp: ${lastSyncTimestamp}`);
      return res.json({
        lastSyncTimestamp: null,
        cooldownRemaining: 0,
        isInProgress
      });
    }

    const timeSinceLastSync = now - lastSyncTime;
    const cooldownRemaining = Math.max(0, Math.ceil((cooldownMs - timeSinceLastSync) / 1000 / 60));

    res.json({
      lastSyncTimestamp,
      cooldownRemaining: isInProgress ? 0 : cooldownRemaining,
      isInProgress,
      status: lastSync.status,
      error: lastSync.error_message
    });
  } catch (error) {
    console.error('Error checking sync status:', error);
    res.status(500).json({
      error: 'Failed to check sync status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Helper function to fetch and process business data (reused across endpoints)
 */
async function fetchBusinessData(
  facilityIds: string[],
  startDate: string,
  endDate: string,
  includeWeekends: boolean
) {
  // Parse facility IDs
  let facilityIdArray: string[] = [];
  if (facilityIds.length === 0) {
    facilityIdArray = ORGANIZATIONS.map(org => org.facilityId);
  } else {
    facilityIdArray = facilityIds;
  }

  // Fetch data ONCE - using business_metrics_daily (derived from unique orders)
  const [summaries, workingDayConfigs] = await Promise.all([
    getBusinessMetricsForRange(facilityIdArray, startDate, endDate),
    getWorkingDaysInRange(startDate, endDate),
  ]);

  // Filter by working days
  const filteredSummaries = filterByWorkingDays(
    summaries,
    workingDayConfigs,
    includeWeekends
  );

  return { filteredSummaries, facilityIdArray };
}

/**
 * API: Get ALL business metrics in one call (optimized to avoid rate limits)
 */
app.get('/api/business-metrics/all', async (req, res) => {
  try {
    const { facilityIds, startDate, endDate, includeWeekends } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Parse facility IDs
    let facilityIdArray: string[] = [];
    if (typeof facilityIds === 'string') {
      facilityIdArray = facilityIds.split(',').filter(id => id.trim() !== '');
    } else if (Array.isArray(facilityIds)) {
      facilityIdArray = facilityIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
    }

    const includeWeekendsFlag = includeWeekends === 'true';

    // Fetch data once (parallel fetching for performance)
    const { filteredSummaries, facilityIdArray: resolvedFacilityIds } = await fetchBusinessData(
      facilityIdArray,
      startDate as string,
      endDate as string,
      includeWeekendsFlag
    );

    // Get unique dates
    const uniqueDates = Array.from(new Set(filteredSummaries.map(s => s.created_at_date))).sort();

    // Calculate summary
    const summary = aggregateDailySummaries(
      filteredSummaries,
      uniqueDates,
      startDate as string,
      endDate as string,
      resolvedFacilityIds
    );

    // Calculate daily breakdown with enhanced metrics
    const summariesByDate = new Map<string, typeof filteredSummaries>();
    filteredSummaries.forEach((s) => {
      const date = s.created_at_date;
      if (!summariesByDate.has(date)) summariesByDate.set(date, []);
      summariesByDate.get(date)!.push(s);
    });

    // First pass: Calculate basic metrics for each day
    const dailyBreakdown = Array.from(summariesByDate.entries()).map(([date, daySummaries]) => {
      const ordersLoaded = daySummaries.reduce((sum, s) => sum + s.total_orders, 0);
      const ordersWorked = daySummaries.reduce((sum, s) => sum + ('total_billable_orders' in s ? s.total_billable_orders : s.orders_completed), 0);
      const authByRisa = daySummaries.reduce((sum, s) => sum + s.status_auth_by_risa, 0);
      const authOnFile = daySummaries.reduce((sum, s) => sum + s.status_auth_on_file, 0);
      const noAuthRequired = daySummaries.reduce((sum, s) => sum + s.status_no_auth_required, 0);
      const denialByRisa = daySummaries.reduce((sum, s) => sum + s.status_denial_by_risa, 0);
      const denialAfterQuery = daySummaries.reduce((sum, s) => sum + s.status_denial_after_query, 0);

      // Open orders statuses (worked but not yet authorized/denied)
      const authRequired = daySummaries.reduce((sum, s) => sum + (s.status_auth_required || 0), 0);
      const pending = daySummaries.reduce((sum, s) => sum + (s.status_pending || 0), 0);
      const hold = daySummaries.reduce((sum, s) => sum + (s.status_hold || 0), 0);
      const query = daySummaries.reduce((sum, s) => sum + (s.status_query || 0), 0);

      const approvalRate = authByRisa + denialByRisa > 0
        ? parseFloat(((authByRisa / (authByRisa + denialByRisa)) * 100).toFixed(1))
        : null;
      const authorizationRate = calculateAuthorizationRate(
        authByRisa,
        authOnFile,
        noAuthRequired,
        denialByRisa,
        denialAfterQuery
      );

      // Get distinct users worked from business metrics (pre-calculated, excludes RISA Agent)
      const activeProviderCount = daySummaries.reduce((sum, s) => sum + (s.distinct_users_worked || 0), 0);

      // Calculate orders per person
      const ordersPerPerson = calculateOrdersPerPerson(ordersWorked, activeProviderCount);

      return {
        date,
        ordersLoaded,
        ordersWorked,
        authByRisa,
        authOnFile,
        noAuthRequired,
        denialByRisa,
        denialAfterQuery,
        approvalRate,
        authorizationRate,
        isWorkingDay: true,
        activeProviderCount,
        ordersPerPerson,
        // Open orders statuses
        authRequired,
        pending,
        hold,
        query,
        // Placeholder values for rolling average and variance (calculated in second pass)
        sevenDayRollingAvg: 0,
        varianceFromAvg: null as number | null,
        variancePercentage: null as number | null,
        performanceStatus: 'normal' as 'above' | 'normal' | 'below',
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    // Second pass: Calculate rolling averages and variance for each day
    dailyBreakdown.forEach((day, index) => {
      // Calculate 7-day rolling average
      day.sevenDayRollingAvg = calculateRollingAverage(dailyBreakdown, index, 7);

      // Calculate variance from rolling average
      if (day.sevenDayRollingAvg > 0) {
        const variance = calculateVariance(day.ordersWorked, day.sevenDayRollingAvg);
        day.varianceFromAvg = variance.absolute;
        day.variancePercentage = variance.percentage;
        day.performanceStatus = determinePerformanceStatus(variance.percentage);
      }
    });

    // Calculate org breakdown
    const summariesByFacility = new Map<string, typeof filteredSummaries>();
    filteredSummaries.forEach((s) => {
      const facilityId = s.facility_id;
      if (!summariesByFacility.has(facilityId)) summariesByFacility.set(facilityId, []);
      summariesByFacility.get(facilityId)!.push(s);
    });

    const orgBreakdown = Array.from(summariesByFacility.entries()).map(([facilityId, orgSummaries]) => {
      const org = ORGANIZATIONS.find(o => o.facilityId === facilityId);
      const orgName = org?.name || facilityId;

      const totalOrdersLoaded = orgSummaries.reduce((sum, s) => sum + s.total_orders, 0);
      const totalOrdersWorked = orgSummaries.reduce((sum, s) => sum + ('total_billable_orders' in s ? s.total_billable_orders : s.orders_completed), 0);
      const authByRisa = orgSummaries.reduce((sum, s) => sum + s.status_auth_by_risa, 0);
      const authOnFile = orgSummaries.reduce((sum, s) => sum + s.status_auth_on_file, 0);
      const noAuthRequired = orgSummaries.reduce((sum, s) => sum + s.status_no_auth_required, 0);
      const denialByRisa = orgSummaries.reduce((sum, s) => sum + s.status_denial_by_risa, 0);
      const denialAfterQuery = orgSummaries.reduce((sum, s) => sum + s.status_denial_after_query, 0);

      const approvalRate = authByRisa + denialByRisa > 0
        ? parseFloat(((authByRisa / (authByRisa + denialByRisa)) * 100).toFixed(1))
        : null;
      const authorizationRate = calculateAuthorizationRate(
        authByRisa,
        authOnFile,
        noAuthRequired,
        denialByRisa,
        denialAfterQuery
      );

      // Calculate average active provider count across all dates (from pre-calculated distinct_users_worked)
      const totalDistinctUsers = orgSummaries.reduce((sum, s) => sum + (s.distinct_users_worked || 0), 0);
      const activeProviderCount = uniqueDates.length > 0
        ? Math.round(totalDistinctUsers / uniqueDates.length)
        : 0;

      // Calculate orders per person
      const ordersPerPerson = calculateOrdersPerPerson(totalOrdersWorked, activeProviderCount);

      // Calculate 7-day average (total worked / number of days)
      const sevenDayAvg = uniqueDates.length > 0
        ? Math.round(totalOrdersWorked / uniqueDates.length)
        : 0;

      // Calculate variance from average
      let varianceFromAvg: number | null = null;
      let variancePercentage: number | null = null;
      let performanceStatus: 'above' | 'normal' | 'below' = 'normal';

      if (sevenDayAvg > 0 && uniqueDates.length > 0) {
        // Use the average daily orders as the comparison point
        const avgDailyOrders = totalOrdersWorked / uniqueDates.length;
        const variance = calculateVariance(avgDailyOrders, sevenDayAvg);
        varianceFromAvg = variance.absolute;
        variancePercentage = variance.percentage;
        performanceStatus = determinePerformanceStatus(variance.percentage);
      }

      return {
        facilityId,
        orgName,
        totalOrdersLoaded,
        totalOrdersWorked,
        approvalRate,
        authorizationRate,
        activeProviderCount,
        ordersPerPerson,
        sevenDayAvg,
        varianceFromAvg,
        variancePercentage,
        performanceStatus,
      };
    }).sort((a, b) => a.orgName.localeCompare(b.orgName));

    // Calculate monitoring tables data
    const monitoringTables = calculateMonitoringTables(filteredSummaries, uniqueDates);

    // Return all data in one response
    res.json({
      summary: { ...summary, monitoringTables },
      dailyBreakdown,
      orgBreakdown,
    });
  } catch (error) {
    console.error('Error fetching business metrics:', error);
    res.status(500).json({ error: 'Failed to fetch business metrics' });
  }
});

/**
 * API: Get working days configuration for a date range
 */
app.get('/api/working-days/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const workingDays = await getWorkingDaysInRange(
      startDate as string,
      endDate as string
    );

    res.json(workingDays);
  } catch (error) {
    console.error('Error fetching working days:', error);
    res.status(500).json({ error: 'Failed to fetch working days' });
  }
});

/**
 * API: Get latest person queue snapshots from queue_daily_log
 */
app.get('/api/queue/latest', async (req, res) => {
  try {
    const { facilityIds } = req.query;

    // Parse facility IDs if provided
    const facilityIdArray = facilityIds
      ? (facilityIds as string).split(',').map(id => id.trim())
      : undefined;

    console.log('Fetching latest queue snapshots from queue_daily_log...', facilityIdArray ? `for facilities: ${facilityIdArray.join(', ')}` : 'for all facilities');

    // Get latest snapshots from queue_daily_log (QUEUE spreadsheet)
    const snapshots = await getLatestFromQueueDailyLog(facilityIdArray);

    // Find most recent timestamp across all snapshots
    const lastUpdated = snapshots.length > 0
      ? snapshots.reduce((latest, s) =>
          s.snapshot_timestamp > latest ? s.snapshot_timestamp : latest,
          snapshots[0].snapshot_timestamp)
      : null;

    res.json({
      snapshots,
      lastUpdated,
      count: snapshots.length,
    });
  } catch (error) {
    console.error('Error fetching queue snapshots:', error);
    res.status(500).json({
      error: 'Failed to fetch queue snapshots',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Store person queue snapshots to queue_daily_log (QUEUE spreadsheet)
 */
app.post('/api/queue/store', async (req, res) => {
  try {
    const { snapshots } = req.body;

    if (!snapshots || !Array.isArray(snapshots)) {
      return res.status(400).json({ error: 'snapshots array is required' });
    }

    // Validate snapshots format
    const validSnapshots: PersonQueueSnapshot[] = snapshots.filter((s: any) => {
      return s.snapshot_timestamp && s.person_name && s.person_id && s.facility_id;
    });

    if (validSnapshots.length === 0) {
      return res.status(400).json({ error: 'No valid snapshots provided' });
    }

    // Store to QUEUE spreadsheet (queue_daily_log)
    console.log(`Storing ${validSnapshots.length} snapshots to queue_daily_log...`);
    await appendQueueDailyLog(validSnapshots);

    res.json({
      success: true,
      message: `Stored ${validSnapshots.length} queue snapshots`,
      count: validSnapshots.length,
    });
  } catch (error) {
    console.error('Error storing queue snapshots:', error);
    res.status(500).json({
      error: 'Failed to store queue snapshots',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Refresh queue data by fetching from Algolia and storing to Sheets
 */
app.post('/api/queue/refresh', async (req, res) => {
  try {
    console.log('[Queue Refresh] Starting queue data refresh...');

    // Import the sync function
    const { syncQueueData } = await import('../services/sync/queueSync');

    // Get all facility IDs
    const facilityIds = ORGANIZATIONS.map(org => org.facilityId);

    // Map team members with facilityId instead of organization
    const teamMembersWithFacility = TEAM_MEMBERS.map(member => {
      const org = ORGANIZATIONS.find(o => o.id.toLowerCase() === member.organization.toLowerCase());
      return {
        name: member.name,
        id: member.id,
        facilityId: org ? org.facilityId : '',
      };
    }).filter(member => member.facilityId); // Remove any members without matching facility

    console.log(`[Queue Refresh] Syncing ${teamMembersWithFacility.length} team members across ${facilityIds.length} facilities`);

    // Sync queue data for all facilities
    const result = await syncQueueData(facilityIds, teamMembersWithFacility);

    res.json({
      success: result.success,
      recordsSynced: result.recordsSynced,
      facilitiesProcessed: result.facilitiesProcessed,
      timestamp: result.timestamp,
      error: result.error,
    });
  } catch (error) {
    console.error('[Queue Refresh] Error refreshing queue data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh queue data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// EV METRICS ENDPOINTS
// ============================================================================

/**
 * API: Get EV metrics summary for date range
 * Query params: organizationIds[] (optional), startDate, endDate
 * Reads from pre-aggregated ev_metrics_daily sheet
 */
app.get('/api/ev-metrics/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getEVMetricsDailyForRange } = await import('../services/sheets/techMetricsSheets');

    const summaries = await getEVMetricsDailyForRange(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    res.json({ success: true, data: summaries });
  } catch (error) {
    console.error('Error fetching EV metrics summary:', error);
    res.status(500).json({
      error: 'Failed to fetch EV metrics summary',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Get EV metrics trend data for charts
 * Query params: organizationIds[] (optional), startDate, endDate
 * Reads from pre-aggregated ev_metrics_daily sheet
 */
app.get('/api/ev-metrics/trend', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getEVMetricsDailyForRange } = await import('../services/sheets/techMetricsSheets');
    const { prepareEVTrendData } = await import('../utils/metrics/evMetrics');

    const summaries = await getEVMetricsDailyForRange(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    const trendData = prepareEVTrendData(summaries);

    res.json({ success: true, data: trendData });
  } catch (error) {
    console.error('Error fetching EV metrics trend:', error);
    res.status(500).json({
      error: 'Failed to fetch EV metrics trend',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Get EV payer breakdown
 * Query params: organizationIds[] (optional), startDate, endDate
 * Reads from unique_orders_status and calculates payer breakdown on-demand
 */
app.get('/api/ev-metrics/payer-breakdown', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getUniqueOrdersForDateRange } = await import('../services/sheets-dual');
    const { calculateEVPayerBreakdownFromOrders } = await import('../utils/metrics/evMetrics');

    const orders = await getUniqueOrdersForDateRange(
      startDate as string,
      endDate as string,
      organizationIds.length > 0 ? organizationIds as string[] : undefined
    );

    const payerBreakdown = calculateEVPayerBreakdownFromOrders(orders);

    res.json({ success: true, data: payerBreakdown });
  } catch (error) {
    console.error('Error fetching EV payer breakdown:', error);
    res.status(500).json({
      error: 'Failed to fetch EV payer breakdown',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Trigger EV metrics recalculation from unique_orders_status
 * Body: { facilityIds: string[], date: string }
 */
app.post('/api/ev-metrics/sync', async (req, res) => {
  try {
    const { facilityIds, date } = req.body;

    if (!facilityIds || !Array.isArray(facilityIds) || facilityIds.length === 0) {
      return res.status(400).json({ error: 'facilityIds array is required' });
    }

    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    const { calculateEVMetricsDaily } = await import('../services/sync');
    const { appendOrUpdateEVMetricsDaily } = await import('../services/sheets/techMetricsSheets');

    console.log(`[API] Recalculating EV metrics daily for ${facilityIds.join(', ')} on ${date}`);

    const results = [];
    let totalOrders = 0;

    for (const facilityId of facilityIds) {
      const evMetrics = await calculateEVMetricsDaily(date, facilityId);
      await appendOrUpdateEVMetricsDaily([evMetrics]);
      results.push(evMetrics);
      totalOrders += evMetrics.total_orders;
    }

    res.json({
      success: true,
      recordsSynced: totalOrders,
      facilitiesProcessed: facilityIds,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error syncing EV metrics:', error);
    res.status(500).json({
      error: 'Failed to sync EV metrics',
      message: error instanceof Error ? error.message : String(error),
      success: false,
    });
  }
});

/**
 * API: Refresh from sheets (reload cached data)
 * Query params: organizationIds[] (optional), startDate, endDate
 * Reads from pre-aggregated ev_metrics_daily sheet
 */
app.get('/api/ev-metrics/refresh-from-sheets', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getEVMetricsDailyForRange } = await import('../services/sheets/techMetricsSheets');

    const summaries = await getEVMetricsDailyForRange(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    res.json({ success: true, data: summaries, refreshed: true });
  } catch (error) {
    console.error('Error refreshing EV metrics from sheets:', error);
    res.status(500).json({
      error: 'Failed to refresh EV metrics from sheets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// RPA METRICS API ENDPOINTS
// ============================================================================

/**
 * API: Get RPA metrics summary for date range
 * Query params: organizationIds[] (optional), startDate, endDate
 */
app.get('/api/rpa-metrics/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getRPARawSnapshots } = await import('../services/sheets/techMetricsSheets');
    const { calculateRPADailySummary } = await import('../utils/metrics/rpaMetrics');

    // Fetch raw snapshots
    const snapshots = await getRPARawSnapshots(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    // Calculate daily summaries
    const summaries = calculateRPADailySummary(snapshots);

    res.json({ success: true, data: summaries });
  } catch (error) {
    console.error('Error fetching RPA metrics summary:', error);
    res.status(500).json({
      error: 'Failed to fetch RPA metrics summary',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Get RPA metrics trend data for charts
 * Query params: organizationIds[] (optional), startDate, endDate
 */
app.get('/api/rpa-metrics/trend', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getRPARawSnapshots } = await import('../services/sheets/techMetricsSheets');
    const { calculateRPADailySummary, prepareRPATrendData } = await import('../utils/metrics/rpaMetrics');

    const snapshots = await getRPARawSnapshots(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    const summaries = calculateRPADailySummary(snapshots);
    const trendData = prepareRPATrendData(summaries);

    res.json({ success: true, data: trendData });
  } catch (error) {
    console.error('Error fetching RPA metrics trend:', error);
    res.status(500).json({
      error: 'Failed to fetch RPA metrics trend',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Get RPA user breakdown
 * Query params: organizationIds[] (optional), startDate, endDate, usernames[] (optional)
 */
app.get('/api/rpa-metrics/user-breakdown', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    const usernames = Array.isArray(req.query.usernames)
      ? req.query.usernames
      : req.query.usernames
        ? [req.query.usernames]
        : [];

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { getRPARawSnapshots } = await import('../services/sheets/techMetricsSheets');
    const { calculateRPAUserBreakdown } = await import('../utils/metrics/rpaMetrics');

    const snapshots = await getRPARawSnapshots(
      organizationIds as string[],
      startDate as string,
      endDate as string
    );

    const dateRange = `${startDate} to ${endDate}`;
    let userBreakdown = calculateRPAUserBreakdown(snapshots, dateRange);

    // Filter by usernames if provided
    if (usernames.length > 0) {
      userBreakdown = userBreakdown.filter((ub) => usernames.includes(ub.username));
    }

    res.json({ success: true, data: userBreakdown });
  } catch (error) {
    console.error('Error fetching RPA user breakdown:', error);
    res.status(500).json({
      error: 'Failed to fetch RPA user breakdown',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Get RPA hourly metrics (for spike detection)
 * Query params: organizationIds[] (optional), date (single date)
 */
app.get('/api/rpa-metrics/hourly', async (req, res) => {
  try {
    const { date } = req.query;
    const organizationIds = Array.isArray(req.query.organizationIds)
      ? req.query.organizationIds
      : req.query.organizationIds
        ? [req.query.organizationIds]
        : [];

    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    const { getRPARawSnapshots } = await import('../services/sheets/techMetricsSheets');
    const { calculateRPAHourlyMetrics } = await import('../utils/metrics/rpaMetrics');

    const snapshots = await getRPARawSnapshots(
      organizationIds as string[],
      date as string,
      date as string
    );

    const hourlyMetrics = calculateRPAHourlyMetrics(snapshots);

    res.json({ success: true, data: hourlyMetrics });
  } catch (error) {
    console.error('Error fetching RPA hourly metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch RPA hourly metrics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * API: Trigger RPA metrics sync
 * Body: { facilityIds: string[], date: string }
 */
app.post('/api/rpa-metrics/sync', async (req, res) => {
  try {
    const { facilityIds, date } = req.body;

    if (!facilityIds || !Array.isArray(facilityIds) || facilityIds.length === 0) {
      return res.status(400).json({ error: 'facilityIds array is required' });
    }

    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    const { syncRPAMetrics } = await import('../services/sync/rpaMetricsSync');

    console.log(`[API] Triggering RPA metrics sync for ${facilityIds.join(', ')} on ${date}`);

    const result = await syncRPAMetrics(facilityIds, date);

    res.json(result);
  } catch (error) {
    console.error('Error syncing RPA metrics:', error);
    res.status(500).json({
      error: 'Failed to sync RPA metrics',
      message: error instanceof Error ? error.message : String(error),
      success: false,
    });
  }
});

/**
 * API: Fetch person performance data for People View
 * Reads from unique_orders_status (one row per order) + person_hourly_performance
 * Query params: personId, startDate, endDate, includeWeekends
 */
app.get('/api/people-metrics/person-performance', async (req, res) => {
  try {
    const { personId, startDate, endDate, includeWeekends } = req.query;

    // Validate required parameters
    if (!personId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'personId, startDate, and endDate are required'
      });
    }

    // Find person in team members
    const person = TEAM_MEMBERS.find(m => m.id === personId);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const personName = person.name;

    // Fetch unique_orders_status data (all orders, one row per order)
    console.log(`[People API] Fetching orders for ${personName} from ${startDate} to ${endDate}`);
    const orderMap = await getExistingOrderStatusMap();
    const allUniqueOrders = Array.from(orderMap.values());

    // Fetch person_hourly_performance data
    const sheets = getSheetsClient();
    const personMetricsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'person_hourly_performance!A:N',
    });
    const personMetricsRows = (personMetricsResponse.data.values || []).slice(1); // Skip header

    // Fetch working days config
    const workingDays = await getWorkingDaysInRange(startDate as string, endDate as string);
    const workingDaySet = new Set(
      workingDays.filter(wd => wd.is_working_day).map(wd => wd.date)
    );

    // Filter ALL orders by date range (for Total Orders Created calculation)
    const allOrdersInRange = allUniqueOrders.filter(order => {
      const createdAtDate = order.created_at_iso ? order.created_at_iso.split('T')[0] : '';
      return createdAtDate >= startDate && createdAtDate <= endDate;
    });

    // Filter orders by person (assigned_to_name) and date range
    const personOrders = allUniqueOrders.filter(order => {
      const createdAtDate = order.created_at_iso ? order.created_at_iso.split('T')[0] : '';
      return (
        order.assigned_to_name === personName &&
        createdAtDate >= startDate &&
        createdAtDate <= endDate
      );
    });

    console.log(`[People API] Found ${personOrders.length} orders for ${personName}`);

    // Group orders by date
    const ordersByDate = new Map<string, UniqueOrderStatus[]>();
    personOrders.forEach(order => {
      const date = order.created_at_iso ? order.created_at_iso.split('T')[0] : '';
      if (!date) return;
      if (!ordersByDate.has(date)) {
        ordersByDate.set(date, []);
      }
      ordersByDate.get(date)!.push(order);
    });

    // Helper function to count auth_status
    const countAuthStatus = (orders: UniqueOrderStatus[], status: string): number => {
      return orders.filter(o => (o.auth_status || '').toLowerCase() === status.toLowerCase()).length;
    };

    // Helper function to calculate status breakdown from unique orders
    const getStatusBreakdown = (orders: UniqueOrderStatus[]): StatusBreakdown => {
      const authByRisa = countAuthStatus(orders, 'auth_by_risa');
      const authOnFile = countAuthStatus(orders, 'auth_on_file');
      const noAuthRequired = countAuthStatus(orders, 'no_auth_required');
      const denialByRisa = countAuthStatus(orders, 'denial_by_risa') + countAuthStatus(orders, 'denied_by_risa');
      const denialAfterQuery = countAuthStatus(orders, 'denial_after_query');
      const existingDenial = countAuthStatus(orders, 'existing_denial');
      const query = countAuthStatus(orders, 'query');
      const pending = countAuthStatus(orders, 'pending');
      const hold = countAuthStatus(orders, 'hold');
      const authRequired = countAuthStatus(orders, 'auth_required');
      const knownTotal = authByRisa + authOnFile + noAuthRequired + denialByRisa +
        denialAfterQuery + existingDenial + query + pending + hold + authRequired;

      return {
        authByRisa,
        authOnFile,
        noAuthRequired,
        denialByRisa,
        denialAfterQuery,
        existingDenial,
        query,
        pending,
        hold,
        authRequired,
        other: orders.length - knownTotal,
      };
    };

    // Helper function to parse time and calculate hours
    const calculateHours = (loginTime: string | null, logoffTime: string | null): number | null => {
      if (!loginTime || !logoffTime) return null;

      const [loginHours, loginMinutes] = loginTime.split(':').map(Number);
      const [logoffHours, logoffMinutes] = logoffTime.split(':').map(Number);

      if (isNaN(loginHours) || isNaN(loginMinutes) || isNaN(logoffHours) || isNaN(logoffMinutes)) {
        return null;
      }

      return (logoffHours + logoffMinutes / 60) - (loginHours + loginMinutes / 60);
    };

    // Build daily breakdown
    const dailyBreakdown: DailyPersonPerformance[] = [];
    const allDates = Array.from(ordersByDate.keys()).sort();

    for (const date of allDates) {
      const ordersForDate = ordersByDate.get(date)!;

      // Get unique organizations worked
      const facilitiesWorked = [...new Set(ordersForDate.map(o => o.org_id))];
      const organizations = facilitiesWorked.map(fid => {
        const org = ORGANIZATIONS.find(o => o.facilityId === fid);
        return org ? org.id.toUpperCase() : fid;
      });

      // Get person metrics for this date from person_hourly_performance
      // Find the LATEST snapshot for this date (not just the first match!)
      let personMetric: any = null;
      let latestTimestamp = '';
      for (const row of personMetricsRows) {
        const rowDate = row[2]; // created_at_date column
        const rowProviderName = row[4]; // provider_name column
        const timestamp = row[0] || ''; // snapshot_timestamp column

        if (rowDate === date && rowProviderName === personName) {
          if (!personMetric || timestamp > latestTimestamp) {
            personMetric = row;
            latestTimestamp = timestamp;
          }
        }
      }

      // Use pre-calculated counts from person_hourly_performance sheet
      const ordersAssigned = personMetric ? parseInt(personMetric[5]) || 0 : 0; // assigned_count column (index 5)
      const ordersWorked = personMetric ? parseInt(personMetric[6]) || 0 : 0; // worked_count column (index 6)
      const ordersNotWorked = personMetric ? parseInt(personMetric[7]) || 0 : 0; // not_worked_count column (index 7)
      const completionRate = ordersAssigned > 0
        ? parseFloat(((ordersWorked / ordersAssigned) * 100).toFixed(1))
        : null;

      const loginTime = personMetric ? personMetric[11] : null; // login_time column (index 11)
      const logoffTime = personMetric ? personMetric[12] : null; // logoff_time column (index 12)
      const hoursWorked = calculateHours(loginTime, logoffTime);
      const paceVsAvg = personMetric ? parseFloat(personMetric[9]) || 0 : 0; // person_pace_vs_avg column
      const paceStatus = personMetric ? personMetric[10] : 'ON_PACE'; // person_pace_status column (index 10)

      // Status breakdown from unique_orders_status (already one row per order)
      // Filter to only completed/in-progress orders for status breakdown
      const completedOrInProgressOrders = ordersForDate.filter(o => {
        const medStatus = (o.medical_order_status || '').toLowerCase();
        return medStatus === 'order_completed_by_agent' ||
               medStatus === 'order_completed_by_human' ||
               medStatus === 'order_in_progress';
      });

      // Map pace status to performance status
      let performanceStatus: 'above' | 'on_pace' | 'below' = 'on_pace';
      if (paceStatus === 'AHEAD') performanceStatus = 'above';
      else if (paceStatus === 'BEHIND') performanceStatus = 'below';

      // Format login/logoff times
      const formatTime = (time: string | null): string | null => {
        if (!time) return null;
        // Handle format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD HH:MM"
        if (time.includes(' ')) {
          const timePart = time.split(' ')[1]; // Get "HH:MM:SS" or "HH:MM"
          const parts = timePart.split(':');
          return `${parts[0]}:${parts[1]}`; // Return HH:MM
        }
        // Handle format: "HH:MM:SS"
        const parts = time.split(':');
        return `${parts[0]}:${parts[1]}`;
      };

      dailyBreakdown.push({
        date,
        dayOfWeek: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
        isWorkingDay: workingDaySet.has(date),
        organizations,
        ordersAssigned,
        ordersWorked,
        ordersNotWorked,
        completionRate,
        statusBreakdown: getStatusBreakdown(completedOrInProgressOrders),
        loginTime: formatTime(loginTime),
        logoffTime: formatTime(logoffTime),
        hoursWorked,
        performanceStatus,
        paceVsAvg,
      });
    }

    // Calculate summary metrics (always use ALL days with data)
    const totalOrdersCreated = allOrdersInRange.length; // Each row in unique_orders_status is already a unique order
    const totalOrdersAssigned = dailyBreakdown.reduce((sum, day) => sum + day.ordersAssigned, 0);
    const totalOrdersCompleted = dailyBreakdown.reduce((sum, day) => sum + day.ordersWorked, 0);
    const completionRate = totalOrdersAssigned > 0
      ? parseFloat(((totalOrdersCompleted / totalOrdersAssigned) * 100).toFixed(1))
      : null;

    // Calculate status breakdown for all person's completed/in-progress orders
    const allPersonCompletedOrders = personOrders.filter(o => {
      const medStatus = (o.medical_order_status || '').toLowerCase();
      return medStatus === 'order_completed_by_agent' ||
             medStatus === 'order_completed_by_human' ||
             medStatus === 'order_in_progress';
    });
    const statusBreakdown = getStatusBreakdown(allPersonCompletedOrders);

    // Calculate approval rate and authorization rate
    const authByRisa = statusBreakdown.authByRisa;
    const denialByRisa = statusBreakdown.denialByRisa;
    const approvalRate = (authByRisa + denialByRisa) > 0
      ? parseFloat(((authByRisa / (authByRisa + denialByRisa)) * 100).toFixed(1))
      : null;

    const authorized = statusBreakdown.authByRisa + statusBreakdown.authOnFile + statusBreakdown.noAuthRequired;
    const denied = statusBreakdown.denialByRisa + statusBreakdown.denialAfterQuery + statusBreakdown.existingDenial;
    const authorizationRate = (authorized + denied) > 0
      ? parseFloat(((authorized / (authorized + denied)) * 100).toFixed(1))
      : null;

    // Calculate hours worked and working days count
    // For averages, respect the includeWeekends toggle
    const workingDaysOnly = includeWeekends === 'false'
      ? dailyBreakdown.filter(day => day.isWorkingDay)
      : dailyBreakdown;

    const totalHoursWorked = dailyBreakdown.reduce((sum, day) => sum + (day.hoursWorked || 0), 0);
    const avgHoursPerDay = workingDaysOnly.length > 0
      ? totalHoursWorked / workingDaysOnly.length
      : 0;

    // Build summary
    const summary: PersonPerformanceSummary = {
      personName,
      personId: personId as string,
      organization: person.organization,
      totalOrdersCreated,
      totalOrdersAssigned,
      totalOrdersCompleted,
      completionRate,
      approvalRate,
      authorizationRate,
      statusBreakdown,
      totalHoursWorked,
      avgHoursPerDay,
      dateRange: {
        startDate: startDate as string,
        endDate: endDate as string,
      },
      workingDaysCount: workingDaysOnly.length,
    };

    console.log(`[People API] Returning summary for ${personName}: ${totalOrdersCompleted} orders completed`);

    res.json({
      summary,
      dailyBreakdown: dailyBreakdown, // Return ALL days with data
    });
  } catch (error) {
    console.error('[People API] Error fetching person performance:', error);
    res.status(500).json({
      error: 'Failed to fetch person performance data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// AGENT MODE METRICS ENDPOINTS
// ============================================================================

/**
 * Calculate ALL orders daily trend data (not just NAR)
 */
function calculateAllOrdersDailyTrend(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): AllOrdersDailyTrend[] {
  // Group orders by date
  const dateMap = new Map<string, AllOrdersDailyTrend>();

  // Initialize all dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    dateMap.set(dateStr, {
      date: dateStr,
      yetToStart: 0,
      pending: 0,
      completedByHuman: 0,
      completedByAgent: 0,
      totalOrders: 0,
    });
  }

  // Count orders by date and status
  for (const order of orders) {
    // Use created_at_iso for grouping (when order was created)
    const orderDate = order.created_at_iso;
    if (!orderDate) continue;

    const dateStr = new Date(orderDate).toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (!dayData) continue;

    // Count orders by status (only count valid statuses)
    switch (order.medical_order_status) {
      case MEDICAL_ORDER_STATUS.YET_TO_START:
        dayData.yetToStart++;
        break;
      case MEDICAL_ORDER_STATUS.IN_PROGRESS:
        dayData.pending++;
        dayData.totalOrders++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN:
        dayData.completedByHuman++;
        dayData.totalOrders++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT:
        dayData.completedByAgent++;
        dayData.totalOrders++;
        break;
      // Orders with null/undefined/invalid status are not counted
    }
  }

  // Return all days in descending order (most recent first)
  return dates
    .map((date) => dateMap.get(date)!)
    .reverse();
}

/**
 * Calculate NAR daily trend data from orders
 */
function calculateNARDailyTrend(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): NARAgentDailyTrend[] {
  // Filter NAR orders
  const narOrders = orders.filter((o) => o.auth_status === NAR_AUTH_STATUS);

  // Group orders by date
  const dateMap = new Map<string, NARAgentDailyTrend>();

  // Initialize all dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    dateMap.set(dateStr, {
      date: dateStr,
      yetToStart: 0,
      pending: 0,
      completedByHuman: 0,
      completedByAgent: 0,
      totalNAR: 0,
    });
  }

  // Count orders by date and status
  for (const order of narOrders) {
    // Use created_at_iso for grouping (when order was created)
    const orderDate = order.created_at_iso;
    if (!orderDate) continue;

    const dateStr = new Date(orderDate).toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (!dayData) continue;

    // Count orders by status (only count valid statuses)
    switch (order.medical_order_status) {
      case MEDICAL_ORDER_STATUS.YET_TO_START:
        dayData.yetToStart++;
        break;
      case MEDICAL_ORDER_STATUS.IN_PROGRESS:
        dayData.pending++;
        dayData.totalNAR++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN:
        dayData.completedByHuman++;
        dayData.totalNAR++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT:
        dayData.completedByAgent++;
        dayData.totalNAR++;
        break;
      // Orders with null/undefined/invalid status are not counted
    }
  }

  // Return all days in descending order (most recent first)
  return dates
    .map((date) => dateMap.get(date)!)
    .reverse();
}

/**
 * Calculate NAR agent review daily data
 */
function calculateNARReviewDaily(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): NARAgentReviewDaily[] {
  // Filter NAR orders completed by agent
  const narAgentOrders = orders.filter(
    (o) =>
      o.auth_status === NAR_AUTH_STATUS &&
      o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT
  );

  // Group orders by date
  const dateMap = new Map<string, NARAgentReviewDaily>();

  // Initialize all dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    dateMap.set(dateStr, {
      date: dateStr,
      totalNARAgentCompleted: 0,
      reviewPassed: 0,
      reviewRejected: 0,
      reviewPending: 0,
      reviewNotRequired: 0,
      passRatePct: 0,
    });
  }

  // Count orders by date and review status
  for (const order of narAgentOrders) {
    // Use created_at_iso for grouping (when order was created)
    const orderDate = order.created_at_iso;
    if (!orderDate) continue;

    const dateStr = new Date(orderDate).toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (!dayData) continue;

    dayData.totalNARAgentCompleted++;

    switch (order.medical_order_review_status) {
      case MEDICAL_ORDER_REVIEW_STATUS.PASSED:
        dayData.reviewPassed++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.REJECTED:
        dayData.reviewRejected++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.PENDING:
        dayData.reviewPending++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.NOT_REQUIRED:
        dayData.reviewNotRequired++;
        break;
    }
  }

  // Calculate pass rates
  for (const dayData of dateMap.values()) {
    const totalReviewed = dayData.reviewPassed + dayData.reviewRejected;
    dayData.passRatePct =
      totalReviewed > 0 ? (dayData.reviewPassed / totalReviewed) * 100 : 0;
  }

  // Return all days in descending order (most recent first)
  return dates
    .map((date) => dateMap.get(date)!)
    .reverse();
}

/**
 * GET /api/agent-mode-metrics
 * Fetch Agent Mode metrics calculated on-the-fly from unique_orders_status
 *
 * Query params:
 *   startDate: YYYY-MM-DD
 *   endDate: YYYY-MM-DD
 *   organizationIds: comma-separated facility IDs (optional, empty = all)
 */
app.get('/api/agent-mode-metrics', async (req, res) => {
  console.log('[Agent Mode API] Fetching agent mode metrics...');
  const startTime = Date.now();

  try {
    const { startDate, endDate, organizationIds } = req.query;

    // Validate required params
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: startDate and endDate',
      });
    }

    // Parse organization IDs
    const orgIds: string[] = organizationIds
      ? (organizationIds as string).split(',').filter(Boolean)
      : [];

    console.log(`[Agent Mode API] Date range: ${startDate} to ${endDate}`);
    console.log(`[Agent Mode API] Organizations: ${orgIds.length > 0 ? orgIds.join(', ') : 'all'}`);

    // Read only the columns needed for agent-mode calculations (8 of 43)
    // This avoids OOM crashes on Cloud Run with 1Gi memory
    const allOrders = await getOrdersForAgentModeMetrics();

    console.log(`[Agent Mode API] Total orders in sheet: ${allOrders.length}`);

    // Filter orders by date range and organization
    const filteredOrders = filterOrders(
      allOrders,
      startDate as string,
      endDate as string,
      orgIds
    );

    console.log(`[Agent Mode API] Filtered orders: ${filteredOrders.length}`);

    // Calculate base metrics
    const baseMetrics = calculateAgentModeMetrics(filteredOrders);

    // Calculate daily trends
    const allOrdersDailyTrend = calculateAllOrdersDailyTrend(
      filteredOrders,
      startDate as string,
      endDate as string
    );

    const narDailyTrend = calculateNARDailyTrend(
      filteredOrders,
      startDate as string,
      endDate as string
    );

    const narReviewDaily = calculateNARReviewDaily(
      filteredOrders,
      startDate as string,
      endDate as string
    );

    // Combine all metrics
    const metrics: AgentModeMetricsData = {
      ...baseMetrics,
      allOrdersDailyTrend,
      narDailyTrend,
      narL7DAverage: null, // Frontend calculates this
      narReviewDaily,
      narReviewL7DAverage: null, // Frontend calculates this
    };

    const duration = Date.now() - startTime;
    console.log(`[Agent Mode API] Completed in ${duration}ms`);
    console.log(`[Agent Mode API] Daily trend days: ${narDailyTrend.length}`);
    console.log(`[Agent Mode API] Review daily days: ${narReviewDaily.length}`);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('[Agent Mode API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// DoS Coverage API (was Treatment Aging)
// ============================================================================
app.get('/api/treatment-aging', async (req, res) => {
  console.log('[DoS Coverage API] Fetching DoS coverage metrics from sheet...');
  const startTime = Date.now();

  try {
    const { startDate, endDate, organizationIds } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: startDate and endDate',
      });
    }

    const orgIds: string[] = organizationIds
      ? (organizationIds as string).split(',').filter(Boolean)
      : [];

    console.log(`[DoS Coverage API] Date range: ${startDate} to ${endDate}`);
    console.log(`[DoS Coverage API] Organizations: ${orgIds.length > 0 ? orgIds.join(', ') : 'all'}`);

    // Read from payer_treatment_aging sheet and aggregate by date
    const { getPayerTreatmentAgingForRange } = await import('../services/sheets-dual');
    const payerRows = await getPayerTreatmentAgingForRange(
      orgIds,
      startDate as string,
      endDate as string
    );

    console.log(`[DoS Coverage API] Sheet rows: ${payerRows.length}`);

    // Aggregate by date (sum across all facilities and payers)
    const dateMap = new Map<string, {
      totalOrders: number;
      bucket0to7: number; bucket8to14: number; bucket15to21: number; bucket21plus: number;
      ordersWorked: number;
      worked0to7: number; worked8to14: number; worked15to21: number; worked21plus: number;
    }>();

    for (const pr of payerRows) {
      const existing = dateMap.get(pr.created_at_date) || {
        totalOrders: 0,
        bucket0to7: 0, bucket8to14: 0, bucket15to21: 0, bucket21plus: 0,
        ordersWorked: 0,
        worked0to7: 0, worked8to14: 0, worked15to21: 0, worked21plus: 0,
      };
      existing.totalOrders += pr.total_orders_loaded;
      existing.bucket0to7 += pr.loaded_0_to_7;
      existing.bucket8to14 += pr.loaded_8_to_14;
      existing.bucket15to21 += pr.loaded_15_to_21;
      existing.bucket21plus += pr.loaded_21_plus;
      existing.ordersWorked += pr.total_orders_billed;
      existing.worked0to7 += pr.billed_0_to_7;
      existing.worked8to14 += pr.billed_8_to_14;
      existing.worked15to21 += pr.billed_15_to_21;
      existing.worked21plus += pr.billed_21_plus;
      dateMap.set(pr.created_at_date, existing);
    }

    const rows = Array.from(dateMap.entries())
      .map(([date, d]) => ({
        date,
        totalOrders: d.totalOrders,
        bucket0to7: d.bucket0to7,
        bucket8to14: d.bucket8to14,
        bucket15to21: d.bucket15to21,
        bucket21plus: d.bucket21plus,
        ordersWorked: d.ordersWorked,
        worked0to7: d.worked0to7,
        worked8to14: d.worked8to14,
        worked15to21: d.worked15to21,
        worked21plus: d.worked21plus,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const duration = Date.now() - startTime;
    console.log(`[DoS Coverage API] Completed in ${duration}ms, ${rows.length} date rows`);

    res.json({
      success: true,
      data: {
        rows,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[DoS Coverage API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Payer Treatment Aging endpoint
app.get('/api/payer-treatment-aging', async (req, res) => {
  console.log('[Payer Treatment Aging API] Fetching payer treatment aging metrics...');
  const startTime = Date.now();

  try {
    const { startDate, endDate, organizationIds } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: startDate and endDate',
      });
    }

    const orgIds: string[] = organizationIds
      ? (organizationIds as string).split(',').filter(Boolean)
      : [];

    console.log(`[Payer Treatment Aging API] Date range: ${startDate} to ${endDate}`);
    console.log(`[Payer Treatment Aging API] Organizations: ${orgIds.length > 0 ? orgIds.join(', ') : 'all'}`);

    // Read all orders from unique_orders_status sheet
    const orderMap = await getExistingOrderStatusMap();
    const allOrders = Array.from(orderMap.values());

    console.log(`[Payer Treatment Aging API] Total orders in sheet: ${allOrders.length}`);

    // Filter orders by date range and organization
    const filteredOrders = filterOrders(
      allOrders,
      startDate as string,
      endDate as string,
      orgIds
    );

    console.log(`[Payer Treatment Aging API] Filtered orders: ${filteredOrders.length}`);

    // Calculate payer treatment aging buckets
    const rows = calculatePayerTreatmentAging(
      filteredOrders,
      startDate as string,
      endDate as string
    );

    const duration = Date.now() - startTime;
    console.log(`[Payer Treatment Aging API] Completed in ${duration}ms, ${rows.length} rows`);

    res.json({
      success: true,
      data: {
        rows,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Payer Treatment Aging API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server with pre-authentication
async function startServer() {
  try {
    // Pre-authenticate to cache the OAuth token before handling requests
    console.log('Pre-authenticating with Google APIs...');
    await initializeAuth();

    app.listen(PORT, () => {
      console.log(`Dashboard API server running on http://localhost:${PORT}`);
      console.log('Google Auth pre-initialized and ready');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Continuing anyway - will retry authentication on first request');

    // Start server anyway - will retry on first request
    app.listen(PORT, () => {
      console.log(`Dashboard API server running on http://localhost:${PORT}`);
      console.log('Warning: Google Auth initialization failed, will retry on requests');
    });
  }
}

startServer();
