#!/usr/bin/env tsx
/**
 * Algolia JSON Structure Analysis
 *
 * Fetches orders from multiple facilities and analyzes the complete JSON structure
 * to identify all unique keys, their value types, and value ranges/patterns.
 */

import { algoliaFetchService } from '../services/algolia-fetch.service';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const logger = createLogger('Analyzer');

// Facilities to analyze
const FACILITIES = [
  { name: 'NYCBS', id: 'HhwIHO4npKhrxyylkC33' },
  { name: 'MBPCC', id: '3GKbZtgpPru1vJGCkxwR' },
  { name: 'CHC/CHCU', id: '4BlQ4SsqAVTDgFKApKZr' },
  { name: 'UCBC/CBC', id: 'W14MolgUu7OYvX4CFQJn' },
];

const TARGET_DATE = '2026-01-09';

interface KeyAnalysis {
  key: string;
  occurrences: number;
  totalOrders: number;
  percentPresent: number;
  valueTypes: Set<string>;
  sampleValues: any[];
  uniqueValues: Set<any>;
  isAlwaysPresent: boolean;
  nullCount: number;
  undefinedCount: number;
  emptyStringCount: number;
  description?: string;
}

interface StructureReport {
  totalOrders: number;
  totalFacilities: number;
  analysisDate: string;
  keys: Map<string, KeyAnalysis>;
  facilityBreakdown: Array<{ name: string; id: string; orderCount: number }>;
}

/**
 * Get the type of a value as a string
 */
function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
}

/**
 * Recursively extract all keys from an object
 */
function extractKeys(obj: any, prefix: string = ''): Map<string, any> {
  const keys = new Map<string, any>();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.set(fullKey, value);

    // Recursively process nested objects (but not arrays)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedKeys = extractKeys(value, fullKey);
      for (const [nestedKey, nestedValue] of nestedKeys) {
        keys.set(nestedKey, nestedValue);
      }
    }
  }

  return keys;
}

/**
 * Analyze all orders and extract key statistics
 */
function analyzeOrders(orders: any[]): Map<string, KeyAnalysis> {
  const keyStats = new Map<string, KeyAnalysis>();

  for (const order of orders) {
    const keys = extractKeys(order);

    for (const [key, value] of keys) {
      if (!keyStats.has(key)) {
        keyStats.set(key, {
          key,
          occurrences: 0,
          totalOrders: orders.length,
          percentPresent: 0,
          valueTypes: new Set(),
          sampleValues: [],
          uniqueValues: new Set(),
          isAlwaysPresent: false,
          nullCount: 0,
          undefinedCount: 0,
          emptyStringCount: 0,
        });
      }

      const stats = keyStats.get(key)!;
      stats.occurrences++;

      const valueType = getValueType(value);
      stats.valueTypes.add(valueType);

      // Track null/undefined/empty
      if (value === null) stats.nullCount++;
      if (value === undefined) stats.undefinedCount++;
      if (value === '') stats.emptyStringCount++;

      // Collect sample values (max 20 unique)
      if (stats.sampleValues.length < 20 && !stats.sampleValues.includes(value)) {
        stats.sampleValues.push(value);
      }

      // Track unique values (for discrete fields)
      if (stats.uniqueValues.size < 1000) {
        try {
          stats.uniqueValues.add(JSON.stringify(value));
        } catch {
          // Skip if value can't be stringified
        }
      }
    }
  }

  // Calculate final statistics
  for (const stats of keyStats.values()) {
    stats.percentPresent = (stats.occurrences / orders.length) * 100;
    stats.isAlwaysPresent = stats.occurrences === orders.length;
  }

  return keyStats;
}

/**
 * Add descriptions for known keys
 */
function addKeyDescriptions(keyStats: Map<string, KeyAnalysis>): void {
  const descriptions: Record<string, string> = {
    'objectID': 'Algolia unique identifier for the document',
    'id': 'Order ID (same as order_id)',
    'order_id': 'Unique identifier for the medical order',
    'org_id': 'Organization/Facility ID',
    'assigned_to': 'User ID of the person assigned to this order',
    'assigned_to_name': 'Name of the person assigned to this order',
    'assigned_at': 'Unix timestamp when order was assigned',
    'assigned_at_iso': 'ISO 8601 timestamp when order was assigned',
    'master_auth_status': 'Primary authorization status of the order',
    'auth_status': 'Current authorization status',
    'medical_order_status': 'Overall medical order status',
    'auth_on_file_status': 'Status of authorization on file',
    'bo_status': 'Benefits/Benefits Office status',
    'document_upload_status': 'Status of document uploads',
    'ev_write_back_status': 'Eligibility Verification write-back status',
    'ev_bv_primary': 'Primary EV/BV status',
    'financial_review': 'Financial review status',
    'nar_check_status': 'NAR (Narcotic Authorization Request) check status',
    'order_creation': 'Order creation status',
    'primary_status': 'Primary workflow status',
    'created_at': 'Unix timestamp when order was created',
    'created_at_iso': 'ISO 8601 timestamp when order was created',
    'date_of_work': 'Unix timestamp for the date work was performed',
    'date_of_work_iso': 'ISO 8601 date when work was performed',
    'indexed_at': 'Unix timestamp when indexed in Algolia',
    'indexed_at_iso': 'ISO 8601 timestamp when indexed in Algolia',
    'updated_at': 'Last update timestamp',
    'auth_on_file_updated_at': 'Last update timestamp for auth on file',
    'patient_id': 'Unique identifier for the patient',
    'first_name': 'Patient first name',
    'last_name': 'Patient last name',
    'date_of_birth': 'Patient date of birth',
    'patient_fhir_identifier': 'FHIR identifier for the patient',
    'practitioner_name': 'Name of the prescribing practitioner',
    'regimen_name': 'Name of the treatment regimen',
    'regimen_type': 'Type of treatment regimen',
    'service_type': 'Type of medical service',
    'primary_member_id': 'Insurance member ID',
    'primary_payer_name': 'Name of primary insurance payer',
    'primary_active': 'Whether primary insurance is active',
    'location': 'Service location',
    'date_of_service': 'Unix timestamp of service date',
    'date_of_service_iso': 'ISO 8601 date of service',
    'mark_as_completed': 'Flag indicating if order is marked complete',
    'alert_badges': 'Array of alert badge identifiers',
    'alerts': 'Array of alert objects',
    'auth_on_file_error_type': 'Type of auth on file error',
    'auth_on_file_error_message': 'Error message for auth on file',
    'ai_agent_type': 'Type of AI agent used (if any)',
    '_highlightResult': 'Algolia search highlighting results',
  };

  for (const [key, stats] of keyStats) {
    if (descriptions[key]) {
      stats.description = descriptions[key];
    }
  }
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: StructureReport): string {
  const sortedKeys = Array.from(report.keys.values()).sort((a, b) => b.percentPresent - a.percentPresent);

  let md = `# Algolia Order JSON Structure Analysis\n\n`;
  md += `**Analysis Date:** ${report.analysisDate}\n`;
  md += `**Total Orders Analyzed:** ${report.totalOrders.toLocaleString()}\n`;
  md += `**Facilities:** ${report.totalFacilities}\n\n`;

  // Facility breakdown
  md += `## Facility Breakdown\n\n`;
  md += `| Facility | Facility ID | Order Count |\n`;
  md += `|----------|-------------|-------------|\n`;
  for (const facility of report.facilityBreakdown) {
    md += `| ${facility.name} | ${facility.id} | ${facility.orderCount.toLocaleString()} |\n`;
  }
  md += `\n`;

  // Key analysis
  md += `## Field Analysis\n\n`;
  md += `**Total Unique Fields:** ${report.keys.size}\n\n`;

  // Group keys by presence
  const alwaysPresent = sortedKeys.filter(k => k.isAlwaysPresent);
  const usuallysPresent = sortedKeys.filter(k => !k.isAlwaysPresent && k.percentPresent >= 50);
  const sometimesPresent = sortedKeys.filter(k => k.percentPresent < 50);

  md += `### Fields Always Present (${alwaysPresent.length})\n\n`;
  md += generateKeyTable(alwaysPresent);

  md += `### Fields Usually Present (≥50%, ${usuallysPresent.length})\n\n`;
  md += generateKeyTable(usuallysPresent);

  md += `### Fields Sometimes Present (<50%, ${sometimesPresent.length})\n\n`;
  md += generateKeyTable(sometimesPresent);

  return md;
}

/**
 * Generate table for a set of keys
 */
function generateKeyTable(keys: KeyAnalysis[]): string {
  let md = `| Field Name | Present | Type(s) | Sample Values | Unique Values | Description |\n`;
  md += `|------------|---------|---------|---------------|---------------|-------------|\n`;

  for (const key of keys) {
    const fieldName = `\`${key.key}\``;
    const present = `${key.percentPresent.toFixed(1)}%`;
    const types = Array.from(key.valueTypes).join(', ');

    // Format sample values
    let sampleValues = key.sampleValues
      .slice(0, 5)
      .map(v => {
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        if (v === '') return '(empty)';
        if (typeof v === 'string') return v.length > 30 ? v.substring(0, 30) + '...' : v;
        if (typeof v === 'object') return JSON.stringify(v).substring(0, 30) + '...';
        return String(v);
      })
      .join(', ');

    if (sampleValues.length > 100) {
      sampleValues = sampleValues.substring(0, 100) + '...';
    }

    const uniqueCount = key.uniqueValues.size >= 1000 ? '1000+' : String(key.uniqueValues.size);
    const description = key.description || '-';

    md += `| ${fieldName} | ${present} | ${types} | ${sampleValues} | ${uniqueCount} | ${description} |\n`;
  }

  md += `\n`;
  return md;
}

/**
 * Generate detailed JSON report
 */
function generateJSONReport(report: StructureReport): any {
  const keys: any[] = [];

  for (const [keyName, stats] of report.keys) {
    keys.push({
      key: keyName,
      occurrences: stats.occurrences,
      percentPresent: stats.percentPresent,
      isAlwaysPresent: stats.isAlwaysPresent,
      valueTypes: Array.from(stats.valueTypes),
      sampleValues: stats.sampleValues,
      uniqueValueCount: stats.uniqueValues.size,
      uniqueValues: stats.uniqueValues.size <= 50 ? Array.from(stats.uniqueValues).map(v => JSON.parse(v)) : undefined,
      nullCount: stats.nullCount,
      undefinedCount: stats.undefinedCount,
      emptyStringCount: stats.emptyStringCount,
      description: stats.description,
    });
  }

  return {
    metadata: {
      analysisDate: report.analysisDate,
      totalOrders: report.totalOrders,
      totalFacilities: report.totalFacilities,
      facilityBreakdown: report.facilityBreakdown,
    },
    summary: {
      totalUniqueKeys: report.keys.size,
      alwaysPresentKeys: keys.filter(k => k.isAlwaysPresent).length,
      usuallyPresentKeys: keys.filter(k => !k.isAlwaysPresent && k.percentPresent >= 50).length,
      sometimesPresentKeys: keys.filter(k => k.percentPresent < 50).length,
    },
    keys: keys.sort((a, b) => b.percentPresent - a.percentPresent),
  };
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    logger.header('Algolia JSON Structure Analysis');
    logger.info(`Target Date: ${TARGET_DATE}`);
    logger.info(`Facilities: ${FACILITIES.length}`);
    logger.blank();

    // Fetch orders from all facilities
    const allOrders: any[] = [];
    const facilityBreakdown: Array<{ name: string; id: string; orderCount: number }> = [];

    for (const facility of FACILITIES) {
      logger.header(`Fetching orders for ${facility.name}`);
      const orders = await algoliaFetchService.fetchOrdersByDate(facility.id, TARGET_DATE);
      logger.success(`Fetched ${orders.length} orders from ${facility.name}`);
      logger.blank();

      allOrders.push(...orders);
      facilityBreakdown.push({
        name: facility.name,
        id: facility.id,
        orderCount: orders.length,
      });
    }

    logger.header('Analysis Summary');
    logger.info(`Total orders collected: ${allOrders.length.toLocaleString()}`);
    logger.blank();

    if (allOrders.length === 0) {
      logger.warn('No orders found. Exiting.');
      return;
    }

    // Analyze structure
    logger.header('Analyzing JSON structure...');
    const keyStats = analyzeOrders(allOrders);
    addKeyDescriptions(keyStats);
    logger.success(`Found ${keyStats.size} unique keys`);
    logger.blank();

    // Create report
    const report: StructureReport = {
      totalOrders: allOrders.length,
      totalFacilities: FACILITIES.length,
      analysisDate: TARGET_DATE,
      keys: keyStats,
      facilityBreakdown,
    };

    // Generate outputs
    logger.header('Generating reports...');

    const outputDir = path.join(__dirname, '../analysis-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save markdown report
    const markdownReport = generateMarkdownReport(report);
    const mdPath = path.join(outputDir, `algolia-structure-${TARGET_DATE}.md`);
    fs.writeFileSync(mdPath, markdownReport);
    logger.success(`Markdown report: ${mdPath}`);

    // Save JSON report
    const jsonReport = generateJSONReport(report);
    const jsonPath = path.join(outputDir, `algolia-structure-${TARGET_DATE}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    logger.success(`JSON report: ${jsonPath}`);

    // Save raw data sample (first 100 orders)
    const samplePath = path.join(outputDir, `algolia-sample-orders-${TARGET_DATE}.json`);
    fs.writeFileSync(samplePath, JSON.stringify(allOrders.slice(0, 100), null, 2));
    logger.success(`Sample orders: ${samplePath}`);

    logger.blank();

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.header('Complete!');
    logger.info(`Total unique keys: ${keyStats.size}`);
    logger.info(`Always present: ${Array.from(keyStats.values()).filter(k => k.isAlwaysPresent).length}`);
    logger.info(`Usually present (≥50%): ${Array.from(keyStats.values()).filter(k => !k.isAlwaysPresent && k.percentPresent >= 50).length}`);
    logger.info(`Sometimes present (<50%): ${Array.from(keyStats.values()).filter(k => k.percentPresent < 50).length}`);
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
