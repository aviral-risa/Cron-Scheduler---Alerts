#!/usr/bin/env tsx
/**
 * Extract Assignee Mapping - Last 7 Days
 *
 * Fetches orders from Algolia for the last 7 days and extracts:
 * - Order ID (objectID)
 * - Assignee Name (assigned_to_name)
 * - Assignee ID (assigned_to)
 *
 * DOES NOT store or sync data anywhere - just outputs to console
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { ORGANIZATIONS } from '../config/test-sheet.config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

interface AssigneeMapping {
  order_id: string;
  order_created_date: string;
  assigned_to_name: string | null;
  assigned_to_id: string | null;
  facility: string;
}

/**
 * Get date range for last 7 days
 */
function getDateRange(): { startDate: string; endDate: string } {
  const today = new Date('2026-01-12'); // Today's date
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  return {
    startDate: formatDate(sevenDaysAgo), // 2026-01-05
    endDate: formatDate(today),            // 2026-01-12
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('ASSIGNEE MAPPING EXTRACTION - LAST 7 DAYS');
  console.log('='.repeat(80));
  console.log();

  const { startDate, endDate } = getDateRange();
  console.log(`Date Range: ${startDate} to ${endDate}`);
  console.log();

  const allMappings: AssigneeMapping[] = [];

  // Fetch from all facilities
  for (const org of ORGANIZATIONS) {
    console.log(`Fetching orders from ${org.name} (${org.facilityId})...`);

    try {
      const orders = await algoliaFetchService.fetchOrdersByDateRange(
        org.facilityId,
        startDate,
        endDate
      );

      console.log(`  ✓ Fetched ${orders.length} orders`);

      // Extract assignee mappings
      for (const order of orders) {
        allMappings.push({
          order_id: order.objectID,
          order_created_date: order.created_at_iso || order.created_date || 'N/A',
          assigned_to_name: order.assigned_to_name || null,
          assigned_to_id: order.assigned_to || null,
          facility: org.name,
        });
      }

      console.log();
    } catch (error: any) {
      console.error(`  ✗ Error fetching from ${org.name}: ${error.message}`);
      console.log();
    }
  }

  // Get unique assignee mappings (name -> ID)
  const uniqueAssignees = new Map<string, Set<string>>();

  for (const mapping of allMappings) {
    if (mapping.assigned_to_name && mapping.assigned_to_id) {
      if (!uniqueAssignees.has(mapping.assigned_to_name)) {
        uniqueAssignees.set(mapping.assigned_to_name, new Set());
      }
      uniqueAssignees.get(mapping.assigned_to_name)!.add(mapping.assigned_to_id);
    }
  }

  // Display results
  console.log('='.repeat(80));
  console.log('UNIQUE ASSIGNEE MAPPINGS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Orders: ${allMappings.length}`);
  console.log(`Assigned Orders: ${allMappings.filter(m => m.assigned_to_name).length}`);
  console.log(`Unassigned Orders: ${allMappings.filter(m => !m.assigned_to_name).length}`);
  console.log(`Unique Assignees: ${uniqueAssignees.size}`);
  console.log();

  console.log('ASSIGNEE NAME → ASSIGNEE ID(s)');
  console.log('-'.repeat(80));

  // Sort by name
  const sortedAssignees = Array.from(uniqueAssignees.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [name, ids] of sortedAssignees) {
    const idList = Array.from(ids).join(', ');
    console.log(`${name.padEnd(35)} → ${idList}`);
  }

  console.log();
  console.log('='.repeat(80));
  console.log('DETAILED BREAKDOWN BY FACILITY');
  console.log('='.repeat(80));
  console.log();

  // Breakdown by facility
  for (const org of ORGANIZATIONS) {
    const facilityMappings = allMappings.filter(m => m.facility === org.name);
    const facilityAssignees = new Map<string, Set<string>>();

    for (const mapping of facilityMappings) {
      if (mapping.assigned_to_name && mapping.assigned_to_id) {
        if (!facilityAssignees.has(mapping.assigned_to_name)) {
          facilityAssignees.set(mapping.assigned_to_name, new Set());
        }
        facilityAssignees.get(mapping.assigned_to_name)!.add(mapping.assigned_to_id);
      }
    }

    console.log(`${org.name}:`);
    console.log(`  Total Orders: ${facilityMappings.length}`);
    console.log(`  Assigned: ${facilityMappings.filter(m => m.assigned_to_name).length}`);
    console.log(`  Unique Assignees: ${facilityAssignees.size}`);

    if (facilityAssignees.size > 0) {
      console.log('  Assignees:');
      for (const [name, ids] of Array.from(facilityAssignees.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const idList = Array.from(ids).join(', ');
        console.log(`    - ${name} → ${idList}`);
      }
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log('DONE - No data was stored or synced');
  console.log('='.repeat(80));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
