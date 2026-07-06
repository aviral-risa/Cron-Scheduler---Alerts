#!/usr/bin/env tsx
/**
 * NYCBS Hourly Trend Analysis
 *
 * Generates two tables:
 * 1. Orders Created By Hour - when orders were created
 * 2. Auth On File Completed By Hour - when auth_on_file was completed
 *
 * Rows: Hours (12am-11pm)
 * Columns: Dates (last 4 days)
 * Values: Count of orders
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { subDays, format } from 'date-fns';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Hourly-Trends');

// NYCBS Configuration
const NYCBS_FACILITY_ID = 'HhwIHO4npKhrxyylkC33';
const ORGANIZATION_NAME = 'NYCBS';
const DAYS_TO_ANALYZE = 4;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse timestamp as IST (ignore timezone suffix)
 */
function parseAsIST(isoString: string): { date: string; hour: number } {
  const date = isoString.substring(0, 10);
  const hour = parseInt(isoString.substring(11, 13), 10);
  return { date, hour };
}

/**
 * Format hour as human-readable label
 */
function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

/**
 * Generate hourly trend table
 */
interface HourlyTrendTable {
  dates: string[]; // Column headers
  hourlyData: Map<number, Map<string, number>>; // hour -> date -> count
}

function generateHourlyTrendTable(
  orders: any[],
  timestampField: string,
  dates: string[]
): HourlyTrendTable {
  const hourlyData = new Map<number, Map<string, number>>();

  // Initialize all hours (0-23) and all dates
  for (let hour = 0; hour < 24; hour++) {
    const dateMap = new Map<string, number>();
    for (const date of dates) {
      dateMap.set(date, 0);
    }
    hourlyData.set(hour, dateMap);
  }

  // Count orders by hour and date
  for (const order of orders) {
    const timestamp = order[timestampField];
    if (!timestamp) continue;

    const { date, hour } = parseAsIST(timestamp);

    if (hourlyData.has(hour) && hourlyData.get(hour)!.has(date)) {
      const dateMap = hourlyData.get(hour)!;
      dateMap.set(date, dateMap.get(date)! + 1);
    }
  }

  return { dates, hourlyData };
}

/**
 * Display table to console
 */
function displayTable(title: string, table: HourlyTrendTable): void {
  logger.header(title);
  logger.blank();

  // Header row
  const headerRow = ['Hour', ...table.dates, 'Total'].join('\t| ');
  console.log(headerRow);
  console.log('-'.repeat(headerRow.length));

  // Data rows
  for (let hour = 0; hour < 24; hour++) {
    const hourLabel = formatHourLabel(hour).padEnd(5);
    const dateMap = table.hourlyData.get(hour)!;

    const counts = table.dates.map((date) => {
      const count = dateMap.get(date) || 0;
      return count.toString().padStart(6);
    });

    const total = table.dates.reduce((sum, date) => sum + (dateMap.get(date) || 0), 0);

    console.log([hourLabel, ...counts, total.toString().padStart(6)].join('\t| '));
  }

  // Total row
  const totals = table.dates.map((date) => {
    let sum = 0;
    for (let hour = 0; hour < 24; hour++) {
      sum += table.hourlyData.get(hour)!.get(date) || 0;
    }
    return sum.toString().padStart(6);
  });

  const grandTotal = totals.reduce((sum, val) => sum + parseInt(val.trim()), 0);

  logger.blank();
  console.log(['Total'.padEnd(5), ...totals, grandTotal.toString().padStart(6)].join('\t| '));
  logger.blank();
}

/**
 * Generate CSV for a table
 */
function generateCSV(title: string, table: HourlyTrendTable): string {
  const rows: string[][] = [];

  // Header row
  rows.push(['Hour', ...table.dates, 'Total']);

  // Data rows
  for (let hour = 0; hour < 24; hour++) {
    const hourLabel = formatHourLabel(hour);
    const dateMap = table.hourlyData.get(hour)!;

    const counts = table.dates.map((date) => (dateMap.get(date) || 0).toString());
    const total = table.dates.reduce((sum, date) => sum + (dateMap.get(date) || 0), 0);

    rows.push([hourLabel, ...counts, total.toString()]);
  }

  // Total row
  const totals = table.dates.map((date) => {
    let sum = 0;
    for (let hour = 0; hour < 24; hour++) {
      sum += table.hourlyData.get(hour)!.get(date) || 0;
    }
    return sum.toString();
  });

  const grandTotal = totals.reduce((sum, val) => sum + parseInt(val), 0);
  rows.push(['Total', ...totals, grandTotal.toString()]);

  // Convert to CSV string
  return rows.map((row) => row.join(',')).join('\n');
}

// ============================================================================
// Main Analysis Logic
// ============================================================================

async function analyzeHourlyTrends() {
  // Calculate date range (last 4 days)
  const today = new Date();
  const endDate = subDays(today, 1); // Yesterday
  const startDate = subDays(endDate, DAYS_TO_ANALYZE - 1);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  // Generate list of dates
  const dates: string[] = [];
  for (let i = 0; i < DAYS_TO_ANALYZE; i++) {
    dates.push(format(subDays(endDate, DAYS_TO_ANALYZE - 1 - i), 'yyyy-MM-dd'));
  }

  logger.header(`Fetching NYCBS orders from ${startDateStr} to ${endDateStr}`);

  // Fetch orders from Algolia
  const allOrders = await algoliaFetchService.fetchOrdersByDateRange(
    NYCBS_FACILITY_ID,
    startDateStr,
    endDateStr
  );

  logger.success(`Fetched ${allOrders.length} total orders`);
  logger.blank();

  if (allOrders.length === 0) {
    logger.warn('No orders found for the specified date range');
    return;
  }

  // Generate Table 1: Orders Created By Hour
  logger.header('Generating Table 1: Orders Created By Hour...');
  const createdTable = generateHourlyTrendTable(allOrders, 'created_at_iso', dates);

  // Generate Table 2: Auth On File Completed By Hour
  logger.header('Generating Table 2: Auth On File Completed By Hour...');
  const completedOrders = allOrders.filter((o: any) => o.auth_on_file_status === 'completed');
  const completedTable = generateHourlyTrendTable(completedOrders, 'auth_on_file_updated_at', dates);

  logger.blank();

  // Display tables to console
  displayTable('Table 1: Orders Created By Hour (IST)', createdTable);
  displayTable('Table 2: Auth On File Completed By Hour (IST)', completedTable);

  // Generate output files
  logger.header('Generating output files...');

  const outputDir = path.join(__dirname, '../analysis-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = format(new Date(), 'yyyy-MM-dd');

  // Save Table 1 CSV
  const csv1 = generateCSV('Orders Created By Hour', createdTable);
  const csv1Path = path.join(outputDir, `nycbs-orders-created-by-hour-${timestamp}.csv`);
  fs.writeFileSync(csv1Path, csv1);
  logger.success(`Table 1 CSV: ${csv1Path}`);

  // Save Table 2 CSV
  const csv2 = generateCSV('Auth On File Completed By Hour', completedTable);
  const csv2Path = path.join(outputDir, `nycbs-auth-completed-by-hour-${timestamp}.csv`);
  fs.writeFileSync(csv2Path, csv2);
  logger.success(`Table 2 CSV: ${csv2Path}`);

  // Save combined JSON
  const jsonReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      organization: ORGANIZATION_NAME,
      facilityId: NYCBS_FACILITY_ID,
      dateRange: { start: startDateStr, end: endDateStr },
      dates,
    },
    ordersCreatedByHour: {
      dates: createdTable.dates,
      hourlyData: Array.from(createdTable.hourlyData.entries()).map(([hour, dateMap]) => ({
        hour,
        hourLabel: formatHourLabel(hour),
        counts: Object.fromEntries(dateMap),
      })),
    },
    authCompletedByHour: {
      dates: completedTable.dates,
      hourlyData: Array.from(completedTable.hourlyData.entries()).map(([hour, dateMap]) => ({
        hour,
        hourLabel: formatHourLabel(hour),
        counts: Object.fromEntries(dateMap),
      })),
    },
  };

  const jsonPath = path.join(outputDir, `nycbs-hourly-trends-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  logger.success(`JSON report: ${jsonPath}`);

  logger.blank();
  logger.header('Complete!');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const startTime = Date.now();

  try {
    logger.header('NYCBS Hourly Trend Analysis');
    logger.info('Analyzing order creation and auth_on_file completion patterns');
    logger.blank();

    await analyzeHourlyTrends();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Execution time: ${duration}s`);
    logger.blank();

  } catch (error: any) {
    logger.blank();
    logger.error('Analysis failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
