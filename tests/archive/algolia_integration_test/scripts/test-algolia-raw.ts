#!/usr/bin/env tsx
/**
 * Algolia Integration Test - Raw Data Extraction
 *
 * Tests fetching order data from Algolia API, transforming to OrderSnapshot format,
 * validating data integrity, and writing to test Google Sheet.
 *
 * Usage:
 *   npm run test:algolia
 *   npm run test:algolia -- --date 2026-01-09 --facility HhwIHO4npKhrxyylkC33
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { algoliaTransformService } from '../services/algolia-transform.service';
import { validationService } from '../services/validation.service';
import { appendOrderSnapshots, getTestSheetUrl } from '../services/test-sheets.service';
import { getOrganizationByFacilityId } from '../config/test-sheet.config';
import { createLogger } from '../utils/logger';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Main');

interface TestOptions {
  date: string; // YYYY-MM-DD
  facilityId: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);

  let date = '2026-01-09'; // Default test date
  let facilityId = 'HhwIHO4npKhrxyylkC33'; // Default: NYCBS

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1];
      i++;
    } else if (args[i] === '--facility' && args[i + 1]) {
      facilityId = args[i + 1];
      i++;
    }
  }

  return { date, facilityId };
}

/**
 * Main test execution
 */
async function main() {
  const startTime = Date.now();

  try {
    // Parse arguments
    const options = parseArgs();
    const org = getOrganizationByFacilityId(options.facilityId);

    logger.header(`Algolia Integration Test - Raw Data`);
    logger.info(`Test Date: ${options.date}`);
    logger.info(`Facility: ${org?.name || 'Unknown'} (${options.facilityId})`);
    logger.blank();

    // Step 1: Fetch orders from Algolia
    logger.header('Step 1: Fetch Orders from Algolia');
    const orders = await algoliaFetchService.fetchOrdersByDate(options.facilityId, options.date);
    logger.blank();

    if (orders.length === 0) {
      logger.warn('No orders found for the specified date and facility');
      logger.info('Test complete (no data to process)');
      return;
    }

    // Step 2: Transform to OrderSnapshot format
    logger.header('Step 2: Transform to OrderSnapshot Format');
    const snapshots = algoliaTransformService.transformOrders(orders);
    logger.blank();

    if (snapshots.length === 0) {
      logger.error('All transformations failed');
      process.exit(1);
    }

    // Step 3: Validate data integrity
    logger.header('Step 3: Validate Data Integrity');
    const stats = validationService.validateSnapshots(snapshots);
    logger.blank();

    // Check if validation passed
    const overallPassRate = (
      stats.field_validation_pass_rate +
      stats.type_validation_pass_rate +
      stats.format_validation_pass_rate +
      stats.derived_logic_pass_rate
    ) / 4;

    if (overallPassRate < 100) {
      logger.warn(`Validation pass rate: ${overallPassRate.toFixed(1)}%`);
      logger.warn('Some validations failed. Check logs above for details.');
    }

    // Step 4: Write to test Google Sheet
    logger.header('Step 4: Write to Test Google Sheet');
    await appendOrderSnapshots(snapshots);
    logger.blank();

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.header('Test Summary');
    logger.success('All steps completed successfully!');
    logger.info(`Total orders fetched: ${orders.length}`);
    logger.info(`Total snapshots created: ${snapshots.length}`);
    logger.info(`Overall validation: ${overallPassRate.toFixed(1)}% pass rate`);
    logger.info(`Execution time: ${duration}s`);
    logger.blank();
    logger.info(`Test Sheet URL: ${getTestSheetUrl()}`);
    logger.blank();

    // Performance note
    if (parseFloat(duration) < 30) {
      logger.success(`✓ Performance: ${duration}s (target: <30s)`);
    } else {
      logger.warn(`⚠ Performance: ${duration}s (target: <30s)`);
    }
  } catch (error: any) {
    logger.blank();
    logger.error('Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main();
