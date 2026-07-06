#!/usr/bin/env tsx
/**
 * NYCBS Auth-on-File Completion Time Analysis
 *
 * Analyzes auth_on_file completion times for NYCBS orders over the last 4 days.
 * Tracks hourly completion percentages to validate technical improvements.
 *
 * This is a TEST script - does NOT touch any existing sheets or live systems.
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

const logger = createLogger('NYCBS-Auth-Analysis');

// NYCBS Configuration
const NYCBS_FACILITY_ID = 'HhwIHO4npKhrxyylkC33';
const ORGANIZATION_NAME = 'NYCBS';
const DAYS_TO_ANALYZE = 4;

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface HourlyMetrics {
  hour: number; // 0-23 (IST)
  hourLabel: string; // "7am", "8am", "1pm", etc.
  completedByThisHour: number; // cumulative count
  percentageByThisHour: number; // cumulative percentage
  newCompletionsThisHour: number; // incremental count for this hour
}

interface DailyAnalysis {
  date: string; // "YYYY-MM-DD"
  totalOrdersCreated: number;
  totalCompletedAuth: number;
  completionRate: number; // percentage
  hourlyBreakdown: HourlyMetrics[];
  missingTimestamps: number; // orders with completed status but no updated_at
}

interface AnalysisReport {
  metadata: {
    generatedAt: string;
    organization: string;
    facilityId: string;
    dateRange: {
      start: string;
      end: string;
    };
    totalDaysAnalyzed: number;
  };
  summary: {
    totalOrdersCreated: number;
    totalCompletedAuth: number;
    overallCompletionRate: number;
  };
  dailyAnalysis: DailyAnalysis[];
  warnings: string[];
}

interface OrderWithCompletion {
  orderId: string;
  createdAtISO: string;
  createdDate: string; // "YYYY-MM-DD"
  authOnFileStatus: string;
  authOnFileUpdatedAt: string | null;
  completionHour: number | null; // IST hour (0-23)
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse timestamp as IST (ignore timezone suffix)
 * User requirement: Treat all timestamps as IST, ignore +00:00 suffix
 *
 * @param isoString - ISO timestamp like "2026-01-15T08:30:00+00:00"
 * @returns { date: "2026-01-15", hour: 8 }
 */
function parseAsIST(isoString: string): { date: string; hour: number } {
  // Extract date: "2026-01-15T08:30:00+00:00" → "2026-01-15"
  const date = isoString.substring(0, 10);

  // Extract hour: "2026-01-15T08:30:00+00:00" → 8
  const hour = parseInt(isoString.substring(11, 13), 10);

  return { date, hour };
}

/**
 * Format hour as human-readable label
 * @param hour - Hour in 24-hour format (0-23)
 * @returns "7am", "12pm", "3pm", etc.
 */
function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

/**
 * Generate hourly breakdown for a specific day's completed orders
 * Continues until reaching 100% or near 100%
 */
function generateHourlyBreakdown(
  completedOrders: OrderWithCompletion[],
  totalCompleted: number
): HourlyMetrics[] {
  // Count completions by hour
  const hourCounts = new Map<number, number>();

  for (const order of completedOrders) {
    if (order.completionHour !== null) {
      const count = hourCounts.get(order.completionHour) || 0;
      hourCounts.set(order.completionHour, count + 1);
    }
  }

  // Build cumulative metrics starting from hour 7 (7am)
  const hourlyBreakdown: HourlyMetrics[] = [];
  let cumulativeCount = 0;

  // Start from 7am (hour 7) and continue until we reach 100% or near 100%
  for (let hour = 7; hour < 24; hour++) {
    const newCompletions = hourCounts.get(hour) || 0;
    cumulativeCount += newCompletions;

    const percentageByThisHour = totalCompleted > 0
      ? (cumulativeCount / totalCompleted) * 100
      : 0;

    hourlyBreakdown.push({
      hour,
      hourLabel: formatHourLabel(hour),
      completedByThisHour: cumulativeCount,
      percentageByThisHour,
      newCompletionsThisHour: newCompletions,
    });

    // Stop if we've reached 100% or very close to it (99.9%)
    if (percentageByThisHour >= 99.9) {
      break;
    }
  }

  // If we haven't reached 100% by 11pm, continue into next day (hours 0-6)
  if (cumulativeCount < totalCompleted * 0.999) {
    for (let hour = 0; hour < 7; hour++) {
      const newCompletions = hourCounts.get(hour) || 0;
      cumulativeCount += newCompletions;

      const percentageByThisHour = totalCompleted > 0
        ? (cumulativeCount / totalCompleted) * 100
        : 0;

      hourlyBreakdown.push({
        hour,
        hourLabel: formatHourLabel(hour),
        completedByThisHour: cumulativeCount,
        percentageByThisHour,
        newCompletionsThisHour: newCompletions,
      });

      if (percentageByThisHour >= 99.9) {
        break;
      }
    }
  }

  return hourlyBreakdown;
}

// ============================================================================
// Main Analysis Logic
// ============================================================================

/**
 * Analyze orders and generate report
 */
async function analyzeAuthCompletion(): Promise<AnalysisReport> {
  const warnings: string[] = [];

  // Calculate date range (last 4 days)
  const today = new Date();
  const endDate = subDays(today, 1); // Yesterday
  const startDate = subDays(endDate, DAYS_TO_ANALYZE - 1);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

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
    warnings.push('No orders found for the specified date range');
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        organization: ORGANIZATION_NAME,
        facilityId: NYCBS_FACILITY_ID,
        dateRange: { start: startDateStr, end: endDateStr },
        totalDaysAnalyzed: DAYS_TO_ANALYZE,
      },
      summary: {
        totalOrdersCreated: 0,
        totalCompletedAuth: 0,
        overallCompletionRate: 0,
      },
      dailyAnalysis: [],
      warnings,
    };
  }

  // Transform and group orders by creation date
  logger.header('Grouping orders by creation date...');

  const ordersByDate = new Map<string, OrderWithCompletion[]>();

  for (const order of allOrders) {
    const createdAtISO = (order as any).created_at_iso;
    const authOnFileStatus = (order as any).auth_on_file_status;
    const authOnFileUpdatedAt = (order as any).auth_on_file_updated_at;

    if (!createdAtISO) {
      continue; // Skip orders without creation timestamp
    }

    const { date: createdDate } = parseAsIST(createdAtISO);

    // Parse completion hour if completed
    let completionHour: number | null = null;
    if (authOnFileStatus === 'completed' && authOnFileUpdatedAt) {
      const { hour } = parseAsIST(authOnFileUpdatedAt);
      completionHour = hour;
    }

    const orderData: OrderWithCompletion = {
      orderId: (order as any).objectID || (order as any).order_id,
      createdAtISO,
      createdDate,
      authOnFileStatus: authOnFileStatus || 'unknown',
      authOnFileUpdatedAt: authOnFileUpdatedAt || null,
      completionHour,
    };

    if (!ordersByDate.has(createdDate)) {
      ordersByDate.set(createdDate, []);
    }
    ordersByDate.get(createdDate)!.push(orderData);
  }

  logger.success(`Grouped orders into ${ordersByDate.size} days`);
  logger.blank();

  // Analyze each day
  logger.header('Analyzing daily completion metrics...');

  const dailyAnalysis: DailyAnalysis[] = [];
  let totalOrdersCreated = 0;
  let totalCompletedAuth = 0;

  // Sort dates
  const sortedDates = Array.from(ordersByDate.keys()).sort();

  for (const date of sortedDates) {
    const dayOrders = ordersByDate.get(date)!;
    const totalCreated = dayOrders.length;

    // Filter completed orders
    const completedOrders = dayOrders.filter(
      (o) => o.authOnFileStatus === 'completed'
    );
    const totalCompleted = completedOrders.length;

    // Count missing timestamps
    const missingTimestamps = completedOrders.filter(
      (o) => !o.authOnFileUpdatedAt
    ).length;

    // Filter out orders with missing timestamps for hourly analysis
    const completedWithTimestamps = completedOrders.filter(
      (o) => o.authOnFileUpdatedAt !== null
    );

    // Generate hourly breakdown
    const hourlyBreakdown = generateHourlyBreakdown(
      completedWithTimestamps,
      totalCompleted
    );

    const completionRate = totalCreated > 0 ? (totalCompleted / totalCreated) * 100 : 0;

    dailyAnalysis.push({
      date,
      totalOrdersCreated: totalCreated,
      totalCompletedAuth: totalCompleted,
      completionRate,
      hourlyBreakdown,
      missingTimestamps,
    });

    totalOrdersCreated += totalCreated;
    totalCompletedAuth += totalCompleted;

    logger.info(`${date}: ${totalCreated} created, ${totalCompleted} completed (${completionRate.toFixed(1)}%)`);

    if (missingTimestamps > 0) {
      const warning = `${date}: ${missingTimestamps} orders with completed status but missing auth_on_file_updated_at timestamp`;
      warnings.push(warning);
      logger.warn(warning);
    }
  }

  logger.blank();

  const overallCompletionRate = totalOrdersCreated > 0
    ? (totalCompletedAuth / totalOrdersCreated) * 100
    : 0;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organization: ORGANIZATION_NAME,
      facilityId: NYCBS_FACILITY_ID,
      dateRange: { start: startDateStr, end: endDateStr },
      totalDaysAnalyzed: DAYS_TO_ANALYZE,
    },
    summary: {
      totalOrdersCreated,
      totalCompletedAuth,
      overallCompletionRate,
    },
    dailyAnalysis,
    warnings,
  };
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate CSV report
 */
function generateCSV(report: AnalysisReport): string {
  // Determine max hours needed across all days
  const maxHours = Math.max(
    ...report.dailyAnalysis.map((day) => day.hourlyBreakdown.length)
  );

  // Build header row
  const headers = ['Date', 'Total Orders', 'Completed', 'Completion %', 'Missing Timestamps'];

  // Add columns for each hour (7am, 8am, etc.)
  const hourLabels: string[] = [];
  for (let i = 7; i < 24; i++) {
    hourLabels.push(formatHourLabel(i));
  }
  for (let i = 0; i < 7; i++) {
    hourLabels.push(formatHourLabel(i));
  }

  // Add hour columns (Count and %)
  for (const label of hourLabels.slice(0, maxHours)) {
    headers.push(`${label} Count`);
    headers.push(`${label} %`);
  }

  const rows: string[][] = [headers];

  // Add data rows
  for (const day of report.dailyAnalysis) {
    const row: string[] = [
      day.date,
      day.totalOrdersCreated.toString(),
      day.totalCompletedAuth.toString(),
      day.completionRate.toFixed(2),
      day.missingTimestamps.toString(),
    ];

    // Add hourly data
    for (let i = 0; i < maxHours; i++) {
      if (i < day.hourlyBreakdown.length) {
        const metrics = day.hourlyBreakdown[i];
        row.push(metrics.completedByThisHour.toString());
        row.push(metrics.percentageByThisHour.toFixed(2));
      } else {
        row.push('');
        row.push('');
      }
    }

    rows.push(row);
  }

  // Convert to CSV string
  return rows.map((row) => row.join(',')).join('\n');
}

/**
 * Display summary to console
 */
function displaySummary(report: AnalysisReport): void {
  logger.header('NYCBS Auth-on-File Completion Analysis');
  logger.info(`Date Range: ${report.metadata.dateRange.start} to ${report.metadata.dateRange.end}`);
  logger.blank();

  logger.header('Overall Summary');
  logger.info(`Total Orders Created: ${report.summary.totalOrdersCreated.toLocaleString()}`);
  logger.info(`Total Completed Auth: ${report.summary.totalCompletedAuth.toLocaleString()}`);
  logger.info(`Overall Completion Rate: ${report.summary.overallCompletionRate.toFixed(2)}%`);
  logger.blank();

  logger.header('Daily Breakdown');
  for (const day of report.dailyAnalysis) {
    logger.blank();
    logger.info(`${day.date}: ${day.totalOrdersCreated} orders created, ${day.totalCompletedAuth} completed (${day.completionRate.toFixed(1)}%)`);

    if (day.hourlyBreakdown.length > 0) {
      for (const metrics of day.hourlyBreakdown) {
        const padding = '  ';
        logger.info(
          `${padding}By ${metrics.hourLabel.padEnd(5)}: ${metrics.completedByThisHour
            .toString()
            .padStart(4)} orders (${metrics.percentageByThisHour.toFixed(1)}%)`
        );
      }
    }

    if (day.missingTimestamps > 0) {
      logger.warn(`  Missing timestamps: ${day.missingTimestamps}`);
    }
  }

  if (report.warnings.length > 0) {
    logger.blank();
    logger.header('Warnings');
    for (const warning of report.warnings) {
      logger.warn(warning);
    }
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const startTime = Date.now();

  try {
    logger.header('NYCBS Auth-on-File Completion Time Analysis');
    logger.info('This is a TEST script - does NOT modify any existing sheets');
    logger.blank();

    // Run analysis
    const report = await analyzeAuthCompletion();

    // Display summary to console
    displaySummary(report);
    logger.blank();

    // Generate output files
    logger.header('Generating output files...');

    const outputDir = path.join(__dirname, '../analysis-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd');

    // Save JSON report
    const jsonPath = path.join(outputDir, `nycbs-auth-completion-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    logger.success(`JSON report: ${jsonPath}`);

    // Save CSV report
    const csvContent = generateCSV(report);
    const csvPath = path.join(outputDir, `nycbs-auth-completion-${timestamp}.csv`);
    fs.writeFileSync(csvPath, csvContent);
    logger.success(`CSV report: ${csvPath}`);

    logger.blank();

    // Execution summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.header('Complete!');
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
