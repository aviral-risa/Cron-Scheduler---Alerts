/**
 * Data Source Configuration
 *
 * Centralized configuration for switching between data sources at platform level.
 * This allows easy migration and fallback between Algolia and Firestore.
 */

export type DataSourceType = 'algolia' | 'firestore';

export interface DataSourceConfig {
  // Primary data source for raw order data
  orderDataSource: DataSourceType;

  // Enable fallback to Firestore if Algolia fails
  enableFirestoreFallback: boolean;

  // Maximum retry attempts before falling back
  maxRetryAttempts: number;

  // Timeout for Algolia requests (ms)
  algoliaTimeout: number;
}

/**
 * Get data source configuration from environment
 *
 * IMPORTANT: Vite requires DIRECT property access on import.meta.env for static analysis.
 * Dynamic bracket notation (import.meta.env[key]) will NOT work and causes runtime errors.
 */
export function getDataSourceConfig(): DataSourceConfig {
  // Browser environment (Vite) - MUST use direct property access for Vite static analysis
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      orderDataSource: (import.meta.env.VITE_ORDER_DATA_SOURCE || import.meta.env.ORDER_DATA_SOURCE || 'algolia') as DataSourceType,
      enableFirestoreFallback: (import.meta.env.VITE_ENABLE_FIRESTORE_FALLBACK || import.meta.env.ENABLE_FIRESTORE_FALLBACK) === 'true',
      maxRetryAttempts: parseInt(import.meta.env.VITE_MAX_RETRY_ATTEMPTS || import.meta.env.MAX_RETRY_ATTEMPTS || '3', 10),
      algoliaTimeout: parseInt(import.meta.env.VITE_ALGOLIA_TIMEOUT || import.meta.env.ALGOLIA_TIMEOUT || '30000', 10),
    };
  }

  // Node.js environment (backend) - dynamic access is OK here since Node.js has real process.env
  if (typeof process !== 'undefined' && process.env) {
    return {
      orderDataSource: (process.env.ORDER_DATA_SOURCE || process.env.VITE_ORDER_DATA_SOURCE || 'algolia') as DataSourceType,
      enableFirestoreFallback: (process.env.ENABLE_FIRESTORE_FALLBACK || process.env.VITE_ENABLE_FIRESTORE_FALLBACK) === 'true',
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || process.env.VITE_MAX_RETRY_ATTEMPTS || '3', 10),
      algoliaTimeout: parseInt(process.env.ALGOLIA_TIMEOUT || process.env.VITE_ALGOLIA_TIMEOUT || '30000', 10),
    };
  }

  // Fallback defaults when neither environment is available
  return {
    orderDataSource: 'algolia',
    enableFirestoreFallback: true,
    maxRetryAttempts: 3,
    algoliaTimeout: 30000,
  };
}

/**
 * Default configuration (Algolia primary, Firestore fallback enabled)
 */
export const DATA_SOURCE_CONFIG: DataSourceConfig = getDataSourceConfig();

/**
 * Check if we should use Algolia as primary source
 */
export function useAlgolia(): boolean {
  return DATA_SOURCE_CONFIG.orderDataSource === 'algolia';
}

/**
 * Check if we should use Firestore as primary source
 */
export function useFirestore(): boolean {
  return DATA_SOURCE_CONFIG.orderDataSource === 'firestore';
}

/**
 * Log current data source configuration
 */
export function logDataSourceConfig(): void {
  console.log('=== Data Source Configuration ===');
  console.log(`  Primary Source: ${DATA_SOURCE_CONFIG.orderDataSource.toUpperCase()}`);
  console.log(`  Firestore Fallback: ${DATA_SOURCE_CONFIG.enableFirestoreFallback ? 'Enabled' : 'Disabled'}`);
  console.log(`  Max Retries: ${DATA_SOURCE_CONFIG.maxRetryAttempts}`);
  console.log(`  Algolia Timeout: ${DATA_SOURCE_CONFIG.algoliaTimeout}ms`);
  console.log('=================================');
}

/**
 * Google Sheets Configuration (Multi-Spreadsheet Architecture)
 *
 * To fix the 10M cell limit issue, we split data into multiple spreadsheets:
 * - RAW_DATA: orders_raw_hourly + config_sync_log (grows ~324k cells/day, ~30 days capacity)
 * - DASHBOARD: aggregated metrics with auto-retention (always < 40k cells)
 * - UNIQUE_STATUS: unique_orders_status (cumulative order states, ~40 cells/order, no retention)
 * - QUEUE: queue_daily_log (permanent daily queue snapshots, synced at 11:59 PM IST)
 */

// Helper to get environment variable (works in both browser and Node.js)
const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] as string | undefined;
  }
  return undefined;
};

/**
 * RAW DATA SPREADSHEET ID
 * Stores: orders_raw_hourly, config_sync_log
 * Growth: ~324k cells/day
 * Capacity: ~30 days before needing archival
 */
export const RAW_DATA_SHEETS_ID = getEnv('VITE_RAW_DATA_SHEETS_ID');

/**
 * DASHBOARD SPREADSHEET ID
 * Stores: org_hourly_metrics (30d), person_hourly_performance (30d),
 *         daily_summary (90d), person_level_queues (latest only), config_working_days
 * Growth: Auto-cleaned via retention policy
 * Capacity: Always < 40k cells (0.4% of limit)
 */
export const DASHBOARD_SHEETS_ID = getEnv('VITE_DASHBOARD_SHEETS_ID');

/**
 * UNIQUE STATUS SPREADSHEET ID
 * Stores: unique_orders_status (latest state of each order with change tracking)
 * Growth: ~40 cells/order (cumulative, no time window)
 * Capacity: ~250k orders before hitting 10M cell limit
 */
export const UNIQUE_STATUS_SHEETS_ID = getEnv('VITE_UNIQUE_STATUS_SHEETS_ID');

/**
 * QUEUE SPREADSHEET ID
 * Stores: queue_daily_log (permanent daily queue snapshots for each person)
 * Growth: ~12 cells/person/day (synced once at 11:59 PM IST)
 * Capacity: Very large - can store years of data
 * Retention: Permanent (no cleanup)
 */
export const QUEUE_SHEETS_ID = getEnv('VITE_QUEUE_SHEETS_ID');

/**
 * LEGACY SPREADSHEET ID (for rollback)
 * Single spreadsheet that hit 10M cell limit
 */
export const LEGACY_SHEETS_ID = getEnv('VITE_GOOGLE_SHEETS_ID');

/**
 * ARCHIVE SPREADSHEET IDs (Versioned for capacity management)
 * Each archive can hold ~250k orders (10M cells ÷ 40 columns) ≈ 1 year of data
 * When one fills up, switch to the next version
 */
export const ARCHIVE_V1_SHEETS_ID = getEnv('VITE_ARCHIVE_V1_SHEETS_ID');
export const ARCHIVE_V2_SHEETS_ID = getEnv('VITE_ARCHIVE_V2_SHEETS_ID');
export const ARCHIVE_V3_SHEETS_ID = getEnv('VITE_ARCHIVE_V3_SHEETS_ID');

/**
 * Get current archive version from environment
 * Defaults to 'v1' if not specified
 */
export function getCurrentArchiveVersion(): 'v1' | 'v2' | 'v3' {
  const version = getEnv('VITE_CURRENT_ARCHIVE_VERSION') || 'v1';
  if (version === 'v2' || version === 'v3') {
    return version;
  }
  return 'v1';
}

/**
 * Get the spreadsheet ID for the current archive version
 */
export function getCurrentArchiveSpreadsheetId(): string | undefined {
  const version = getCurrentArchiveVersion();
  switch (version) {
    case 'v1':
      return ARCHIVE_V1_SHEETS_ID;
    case 'v2':
      return ARCHIVE_V2_SHEETS_ID;
    case 'v3':
      return ARCHIVE_V3_SHEETS_ID;
    default:
      return ARCHIVE_V1_SHEETS_ID;
  }
}

/**
 * Check if multi-spreadsheet mode is enabled
 * Returns true if all three new sheet IDs are configured
 *
 * Note: Reads env vars directly to avoid module load timing issues
 */
export function isMultiSpreadsheetMode(): boolean {
  const raw = getEnv('VITE_RAW_DATA_SHEETS_ID');
  const dashboard = getEnv('VITE_DASHBOARD_SHEETS_ID');
  const unique = getEnv('VITE_UNIQUE_STATUS_SHEETS_ID');
  return !!(raw && dashboard && unique);
}

/**
 * Check if dual-spreadsheet mode is enabled (backward compatibility)
 * Returns true if at least RAW_DATA and DASHBOARD are configured
 *
 * Note: Reads env vars directly to avoid module load timing issues
 */
export function isDualSpreadsheetMode(): boolean {
  const raw = getEnv('VITE_RAW_DATA_SHEETS_ID');
  const dashboard = getEnv('VITE_DASHBOARD_SHEETS_ID');
  return !!(raw && dashboard);
}

/**
 * Get the appropriate spreadsheet ID for a given sheet type
 * @param sheetType 'raw', 'dashboard', 'unique_status', or 'queue'
 * @returns spreadsheet ID
 */
export function getSpreadsheetId(sheetType: 'raw' | 'dashboard' | 'unique_status' | 'queue'): string | undefined {
  if (!isDualSpreadsheetMode()) {
    // Fallback to legacy single spreadsheet
    return LEGACY_SHEETS_ID;
  }

  switch (sheetType) {
    case 'raw':
      return RAW_DATA_SHEETS_ID;
    case 'dashboard':
      return DASHBOARD_SHEETS_ID;
    case 'unique_status':
      return UNIQUE_STATUS_SHEETS_ID || DASHBOARD_SHEETS_ID; // Fallback to dashboard if not configured
    case 'queue':
      return QUEUE_SHEETS_ID || UNIQUE_STATUS_SHEETS_ID || DASHBOARD_SHEETS_ID; // Fallback chain
    default:
      return LEGACY_SHEETS_ID;
  }
}

/**
 * Log spreadsheet configuration
 */
export function logSpreadsheetConfig(): void {
  console.log('=== Google Sheets Configuration ===');
  if (isMultiSpreadsheetMode()) {
    console.log('  Mode: MULTI-SPREADSHEET (4-sheet architecture)');
    console.log(`  Raw Data Sheet: ${RAW_DATA_SHEETS_ID}`);
    console.log(`  Dashboard Sheet: ${DASHBOARD_SHEETS_ID}`);
    console.log(`  Unique Status Sheet: ${UNIQUE_STATUS_SHEETS_ID}`);
    if (QUEUE_SHEETS_ID) {
      console.log(`  Queue Sheet: ${QUEUE_SHEETS_ID}`);
    } else {
      console.log(`  Queue Sheet: (using Unique Status fallback)`);
    }
    const currentArchive = getCurrentArchiveSpreadsheetId();
    if (currentArchive) {
      console.log(`  Archive Sheet (${getCurrentArchiveVersion()}): ${currentArchive}`);
    }
  } else if (isDualSpreadsheetMode()) {
    console.log('  Mode: DUAL-SPREADSHEET (2-sheet architecture)');
    console.log(`  Raw Data Sheet: ${RAW_DATA_SHEETS_ID}`);
    console.log(`  Dashboard Sheet: ${DASHBOARD_SHEETS_ID}`);
    console.log(`  Note: Unique status and Queue will use Dashboard sheet`);
  } else {
    console.log('  Mode: LEGACY (single spreadsheet)');
    console.log(`  Legacy Sheet: ${LEGACY_SHEETS_ID}`);
  }
  console.log('====================================');
}
