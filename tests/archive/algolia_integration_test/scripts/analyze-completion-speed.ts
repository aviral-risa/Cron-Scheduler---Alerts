#!/usr/bin/env tsx
/**
 * Analyze if orders are completing FASTER on later days
 * Compare completion timing across the 4 days
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { createLogger } from '../utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { subDays, format } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Speed-Analysis');

const NYCBS_FACILITY_ID = 'HhwIHO4npKhrxyylkC33';
const DAYS_TO_ANALYZE = 4;

function parseAsIST(isoString: string): { date: string; hour: number } {
  const date = isoString.substring(0, 10);
  const hour = parseInt(isoString.substring(11, 13), 10);
  return { date, hour };
}

async function main() {
  const today = new Date();
  const endDate = subDays(today, 1);
  const startDate = subDays(endDate, DAYS_TO_ANALYZE - 1);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  logger.header(`Analyzing completion speed trends: ${startDateStr} to ${endDateStr}`);

  const allOrders = await algoliaFetchService.fetchOrdersByDateRange(
    NYCBS_FACILITY_ID,
    startDateStr,
    endDateStr
  );

  logger.success(`Fetched ${allOrders.length} orders`);
  logger.blank();

  // Group by creation date
  const dates: string[] = [];
  for (let i = 0; i < DAYS_TO_ANALYZE; i++) {
    dates.push(format(subDays(endDate, DAYS_TO_ANALYZE - 1 - i), 'yyyy-MM-dd'));
  }

  logger.header('Completion Speed Analysis');
  logger.blank();

  for (const date of dates) {
    // Get orders created on this date
    const dayOrders = allOrders.filter((o: any) => {
      if (!o.created_at_iso) return false;
      const { date: createdDate } = parseAsIST(o.created_at_iso);
      return createdDate === date;
    });

    // Get completed orders
    const completedOrders = dayOrders.filter((o: any) =>
      o.auth_on_file_status === 'completed' && o.auth_on_file_updated_at
    );

    const totalCreated = dayOrders.length;
    const totalCompleted = completedOrders.length;

    logger.info(`${date}: ${totalCreated} created, ${totalCompleted} completed`);

    // Count completions by hour buckets
    const completionsByHour = new Map<number, number>();
    for (const order of completedOrders) {
      const { hour } = parseAsIST((order as any).auth_on_file_updated_at);
      completionsByHour.set(hour, (completionsByHour.get(hour) || 0) + 1);
    }

    // Calculate cumulative percentages
    const milestones = [
      { hour: 0, label: 'By 12am' },
      { hour: 1, label: 'By 1am' },
      { hour: 2, label: 'By 2am' },
      { hour: 3, label: 'By 3am' },
      { hour: 4, label: 'By 4am' },
      { hour: 5, label: 'By 5am' },
      { hour: 6, label: 'By 6am' },
      { hour: 7, label: 'By 7am' },
    ];

    for (const milestone of milestones) {
      let cumulative = 0;
      for (let h = 0; h <= milestone.hour; h++) {
        cumulative += completionsByHour.get(h) || 0;
      }
      const percentage = totalCompleted > 0 ? (cumulative / totalCompleted) * 100 : 0;
      console.log(`  ${milestone.label.padEnd(10)}: ${cumulative.toString().padStart(4)} (${percentage.toFixed(1).padStart(5)}%)`);
    }

    logger.blank();
  }

  // Comparison summary
  logger.header('Comparison: Early Days vs Later Days');
  logger.blank();

  const earlyDays = dates.slice(0, 2); // Jan 15-16
  const laterDays = dates.slice(2, 4); // Jan 17-18

  for (const period of [
    { name: 'Early Days (Jan 15-16)', dates: earlyDays },
    { name: 'Later Days (Jan 17-18)', dates: laterDays },
  ]) {
    logger.info(period.name);

    let totalCreated = 0;
    let totalCompleted = 0;
    const cumulativeByHour = new Map<number, number>();

    for (const date of period.dates) {
      const dayOrders = allOrders.filter((o: any) => {
        if (!o.created_at_iso) return false;
        const { date: createdDate } = parseAsIST(o.created_at_iso);
        return createdDate === date;
      });

      const completedOrders = dayOrders.filter((o: any) =>
        o.auth_on_file_status === 'completed' && o.auth_on_file_updated_at
      );

      totalCreated += dayOrders.length;
      totalCompleted += completedOrders.length;

      for (const order of completedOrders) {
        const { hour } = parseAsIST((order as any).auth_on_file_updated_at);
        cumulativeByHour.set(hour, (cumulativeByHour.get(hour) || 0) + 1);
      }
    }

    for (const milestone of [
      { hour: 1, label: 'By 1am' },
      { hour: 2, label: 'By 2am' },
      { hour: 3, label: 'By 3am' },
      { hour: 4, label: 'By 4am' },
      { hour: 5, label: 'By 5am' },
      { hour: 6, label: 'By 6am' },
    ]) {
      let cumulative = 0;
      for (let h = 0; h <= milestone.hour; h++) {
        cumulative += cumulativeByHour.get(h) || 0;
      }
      const percentage = totalCompleted > 0 ? (cumulative / totalCompleted) * 100 : 0;
      console.log(`  ${milestone.label.padEnd(10)}: ${percentage.toFixed(1).padStart(5)}%`);
    }

    logger.blank();
  }

  // Calculate improvement
  logger.header('Improvement Analysis');
  logger.blank();

  const earlyCompleted = allOrders.filter((o: any) => {
    if (!o.created_at_iso || !o.auth_on_file_updated_at) return false;
    const { date: createdDate } = parseAsIST(o.created_at_iso);
    return earlyDays.includes(createdDate) && o.auth_on_file_status === 'completed';
  });

  const laterCompleted = allOrders.filter((o: any) => {
    if (!o.created_at_iso || !o.auth_on_file_updated_at) return false;
    const { date: createdDate } = parseAsIST(o.created_at_iso);
    return laterDays.includes(createdDate) && o.auth_on_file_status === 'completed';
  });

  // Calculate "by 4am" completion rate
  const earlyBy4am = earlyCompleted.filter((o: any) => {
    const { hour } = parseAsIST(o.auth_on_file_updated_at);
    return hour <= 4;
  }).length;

  const laterBy4am = laterCompleted.filter((o: any) => {
    const { hour } = parseAsIST(o.auth_on_file_updated_at);
    return hour <= 4;
  }).length;

  const earlyBy4amPct = (earlyBy4am / earlyCompleted.length) * 100;
  const laterBy4amPct = (laterBy4am / laterCompleted.length) * 100;

  logger.info(`Completion by 4am:`);
  console.log(`  Jan 15-16: ${earlyBy4amPct.toFixed(1)}%`);
  console.log(`  Jan 17-18: ${laterBy4amPct.toFixed(1)}%`);
  console.log(`  Improvement: +${(laterBy4amPct - earlyBy4amPct).toFixed(1)}% points`);

  logger.blank();

  // Calculate "by 5am" completion rate
  const earlyBy5am = earlyCompleted.filter((o: any) => {
    const { hour } = parseAsIST(o.auth_on_file_updated_at);
    return hour <= 5;
  }).length;

  const laterBy5am = laterCompleted.filter((o: any) => {
    const { hour } = parseAsIST(o.auth_on_file_updated_at);
    return hour <= 5;
  }).length;

  const earlyBy5amPct = (earlyBy5am / earlyCompleted.length) * 100;
  const laterBy5amPct = (laterBy5am / laterCompleted.length) * 100;

  logger.info(`Completion by 5am:`);
  console.log(`  Jan 15-16: ${earlyBy5amPct.toFixed(1)}%`);
  console.log(`  Jan 17-18: ${laterBy5amPct.toFixed(1)}%`);
  console.log(`  Improvement: +${(laterBy5amPct - earlyBy5amPct).toFixed(1)}% points`);

  logger.blank();
  logger.success('Analysis complete!');
}

main().catch(console.error);
