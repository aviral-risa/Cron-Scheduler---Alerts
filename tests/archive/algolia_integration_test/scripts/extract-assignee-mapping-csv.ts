#!/usr/bin/env tsx
/**
 * Extract Assignee Mapping to CSV - Last 7 Days
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { ORGANIZATIONS } from '../config/test-sheet.config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
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
  const today = new Date('2026-01-12');
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  return {
    startDate: formatDate(sevenDaysAgo),
    endDate: formatDate(today),
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('Fetching assignee mapping data...');
  console.log();

  const { startDate, endDate } = getDateRange();
  console.log(`Date Range: ${startDate} to ${endDate}`);
  console.log();

  const allMappings: AssigneeMapping[] = [];

  // Fetch from all facilities
  for (const org of ORGANIZATIONS) {
    console.log(`Fetching from ${org.name}...`);

    try {
      const orders = await algoliaFetchService.fetchOrdersByDateRange(
        org.facilityId,
        startDate,
        endDate
      );

      for (const order of orders) {
        allMappings.push({
          order_id: order.objectID,
          order_created_date: order.created_at_iso || order.created_date || 'N/A',
          assigned_to_name: order.assigned_to_name || null,
          assigned_to_id: order.assigned_to || null,
          facility: org.name,
        });
      }
    } catch (error: any) {
      console.error(`Error fetching from ${org.name}: ${error.message}`);
    }
  }

  console.log();
  console.log(`Total orders fetched: ${allMappings.length}`);
  console.log();

  // Create summary by assignee
  interface AssigneeSummary {
    assignee_name: string;
    assignee_id: string;
    facilities: Set<string>;
    order_count: number;
  }

  const assigneeMap = new Map<string, AssigneeSummary>();

  for (const mapping of allMappings) {
    if (mapping.assigned_to_name && mapping.assigned_to_id) {
      const key = `${mapping.assigned_to_name}|${mapping.assigned_to_id}`;

      if (!assigneeMap.has(key)) {
        assigneeMap.set(key, {
          assignee_name: mapping.assigned_to_name,
          assignee_id: mapping.assigned_to_id,
          facilities: new Set(),
          order_count: 0,
        });
      }

      const summary = assigneeMap.get(key)!;
      summary.facilities.add(mapping.facility);
      summary.order_count++;
    }
  }

  // Generate CSV
  const csvRows: string[] = [];

  // Header
  csvRows.push('Assignee Name,Assignee ID,Facilities,Order Count (Last 7 Days)');

  // Data rows - sorted by name
  const sortedAssignees = Array.from(assigneeMap.values()).sort((a, b) =>
    a.assignee_name.localeCompare(b.assignee_name)
  );

  for (const assignee of sortedAssignees) {
    const facilities = Array.from(assignee.facilities).sort().join('; ');
    csvRows.push(`"${assignee.assignee_name}","${assignee.assignee_id}","${facilities}",${assignee.order_count}`);
  }

  // Write CSV file
  const outputPath = path.join(__dirname, '../analysis-output/assignee-mapping-last-7-days.csv');
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');

  console.log('CSV file created successfully!');
  console.log(`Location: ${outputPath}`);
  console.log();
  console.log(`Total unique assignees: ${assigneeMap.size}`);
  console.log();

  // Also create a detailed CSV with all orders
  const detailedCsvRows: string[] = [];
  detailedCsvRows.push('Order ID,Order Created Date,Assignee Name,Assignee ID,Facility');

  for (const mapping of allMappings) {
    detailedCsvRows.push(
      `"${mapping.order_id}","${mapping.order_created_date}","${mapping.assigned_to_name || ''}","${mapping.assigned_to_id || ''}","${mapping.facility}"`
    );
  }

  const detailedOutputPath = path.join(__dirname, '../analysis-output/assignee-mapping-detailed-last-7-days.csv');
  fs.writeFileSync(detailedOutputPath, detailedCsvRows.join('\n'), 'utf-8');

  console.log('Detailed CSV file created successfully!');
  console.log(`Location: ${detailedOutputPath}`);
  console.log();
  console.log('DONE - No data was stored or synced to any dashboard');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
