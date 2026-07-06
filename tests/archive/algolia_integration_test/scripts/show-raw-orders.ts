#!/usr/bin/env tsx
/**
 * Show raw Algolia response for orders created at specific hours
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Raw-Orders');

const NYCBS_FACILITY_ID = 'HhwIHO4npKhrxyylkC33';

function parseAsIST(isoString: string): { date: string; hour: number } {
  const date = isoString.substring(0, 10);
  const hour = parseInt(isoString.substring(11, 13), 10);
  return { date, hour };
}

async function main() {
  logger.header('Fetching NYCBS orders from 2026-01-18');

  const orders = await algoliaFetchService.fetchOrdersByDate(NYCBS_FACILITY_ID, '2026-01-18');

  logger.success(`Fetched ${orders.length} orders`);
  logger.blank();

  // Group orders by creation hour
  const ordersByHour = new Map<number, any[]>();

  for (const order of orders) {
    const createdAt = (order as any).created_at_iso;
    if (!createdAt) continue;

    const { hour } = parseAsIST(createdAt);

    if (!ordersByHour.has(hour)) {
      ordersByHour.set(hour, []);
    }
    ordersByHour.get(hour)!.push(order);
  }

  // Show samples for 1am, 2am, 3am
  const targetHours = [1, 2, 3];

  for (const hour of targetHours) {
    const hourOrders = ordersByHour.get(hour) || [];
    const hourLabel = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;

    logger.header(`Orders Created at ${hourLabel} IST (${hourOrders.length} total)`);
    logger.blank();

    if (hourOrders.length === 0) {
      logger.warn('No orders found for this hour');
      logger.blank();
      continue;
    }

    // Show first 3 orders
    const samplesToShow = Math.min(3, hourOrders.length);

    for (let i = 0; i < samplesToShow; i++) {
      const order = hourOrders[i];

      logger.info(`Sample ${i + 1}:`);
      console.log(JSON.stringify(order, null, 2));
      logger.blank();
    }

    logger.blank();
  }

  // Save raw samples to file
  const outputDir = path.join(__dirname, '../analysis-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const samples = {
    metadata: {
      date: '2026-01-18',
      facility: 'NYCBS',
      facilityId: NYCBS_FACILITY_ID,
      generatedAt: new Date().toISOString(),
    },
    samples: {} as any,
  };

  for (const hour of targetHours) {
    const hourOrders = ordersByHour.get(hour) || [];
    const hourLabel = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;

    samples.samples[hourLabel] = {
      hour,
      totalOrders: hourOrders.length,
      sampleOrders: hourOrders.slice(0, 3),
    };
  }

  const jsonPath = path.join(outputDir, 'nycbs-raw-orders-by-hour-2026-01-19.json');
  fs.writeFileSync(jsonPath, JSON.stringify(samples, null, 2));
  logger.success(`Raw samples saved to: ${jsonPath}`);
  logger.blank();

  // Show summary statistics
  logger.header('Summary - Orders by Creation Hour (2026-01-18)');
  logger.blank();

  const sortedHours = Array.from(ordersByHour.keys()).sort((a, b) => a - b);

  for (const hour of sortedHours) {
    const count = ordersByHour.get(hour)!.length;
    const hourLabel = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
    console.log(`  ${hourLabel.padEnd(5)}: ${count.toString().padStart(4)} orders`);
  }

  logger.blank();
  logger.success('Complete!');
}

main().catch(console.error);
