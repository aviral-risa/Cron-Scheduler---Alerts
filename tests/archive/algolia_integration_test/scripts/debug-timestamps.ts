#!/usr/bin/env tsx
/**
 * Debug script to show sample orders with their raw timestamps
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { createLogger } from '../utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Debug');

async function main() {
  const NYCBS_FACILITY_ID = 'HhwIHO4npKhrxyylkC33';

  logger.header('Fetching sample NYCBS orders from 2026-01-18');

  const orders = await algoliaFetchService.fetchOrdersByDate(NYCBS_FACILITY_ID, '2026-01-18');

  logger.success(`Fetched ${orders.length} orders`);
  logger.blank();

  // Filter for completed auth_on_file orders
  const completedOrders = orders.filter((o: any) => o.auth_on_file_status === 'completed');

  logger.info(`Found ${completedOrders.length} completed orders`);
  logger.blank();

  // Filter orders by specific hours
  const ordersAt1AM = completedOrders.filter((o: any) => {
    if (!o.auth_on_file_updated_at) return false;
    const hour = parseInt(o.auth_on_file_updated_at.substring(11, 13), 10);
    return hour === 1;
  });

  const ordersAt2AM = completedOrders.filter((o: any) => {
    if (!o.auth_on_file_updated_at) return false;
    const hour = parseInt(o.auth_on_file_updated_at.substring(11, 13), 10);
    return hour === 2;
  });

  logger.header(`Orders completing at 1AM IST (found ${ordersAt1AM.length}):`);
  logger.blank();

  for (let i = 0; i < Math.min(10, ordersAt1AM.length); i++) {
    const order: any = ordersAt1AM[i];

    console.log(`Order ${i + 1}:`);
    console.log(`  Order ID: ${order.objectID || order.order_id}`);
    console.log(`  created_at_iso: ${order.created_at_iso}`);
    console.log(`  auth_on_file_updated_at: ${order.auth_on_file_updated_at}`);
    console.log('');
  }

  logger.header(`Orders completing at 2AM IST (found ${ordersAt2AM.length}):`);
  logger.blank();

  for (let i = 0; i < Math.min(10, ordersAt2AM.length); i++) {
    const order: any = ordersAt2AM[i];

    console.log(`Order ${i + 1}:`);
    console.log(`  Order ID: ${order.objectID || order.order_id}`);
    console.log(`  created_at_iso: ${order.created_at_iso}`);
    console.log(`  auth_on_file_updated_at: ${order.auth_on_file_updated_at}`);
    console.log('');
  }

  // Group by hour to show distribution
  logger.header('Distribution by Hour (of completion):');
  const hourCounts = new Map<number, number>();

  for (const order of completedOrders) {
    const timestamp = (order as any).auth_on_file_updated_at;
    if (timestamp) {
      const hour = parseInt(timestamp.substring(11, 13), 10);
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  }

  // Sort by hour
  const sortedHours = Array.from(hourCounts.entries()).sort((a, b) => a[0] - b[0]);

  for (const [hour, count] of sortedHours) {
    const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
    console.log(`  ${label.padEnd(5)}: ${count} orders`);
  }
}

main().catch(console.error);
