#!/usr/bin/env tsx
/**
 * Generate CSV Report from Algolia Structure Analysis
 *
 * Creates a detailed CSV with all keys and their possible values
 * Fields with 30+ unique values show "..." instead of all values
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DATE = '2026-01-09';
const VALUE_THRESHOLD = 30;

interface KeyData {
  key: string;
  occurrences: number;
  percentPresent: number;
  isAlwaysPresent: boolean;
  valueTypes: string[];
  uniqueValueCount: number;
  uniqueValues?: any[];
  nullCount: number;
  undefinedCount: number;
  emptyStringCount: number;
  description?: string;
}

interface JSONReport {
  metadata: {
    analysisDate: string;
    totalOrders: number;
    totalFacilities: number;
  };
  keys: KeyData[];
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string): string {
  if (!value) return '';

  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Format unique values for CSV
 */
function formatUniqueValues(key: KeyData): string {
  if (key.uniqueValueCount >= VALUE_THRESHOLD) {
    return '...';
  }

  if (!key.uniqueValues || key.uniqueValues.length === 0) {
    return '';
  }

  // Format each value
  const formattedValues = key.uniqueValues.map(v => {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (v === '') return '(empty string)';
    if (typeof v === 'string') {
      // Truncate very long strings
      return v.length > 100 ? v.substring(0, 100) + '...' : v;
    }
    if (typeof v === 'object') {
      const str = JSON.stringify(v);
      return str.length > 100 ? str.substring(0, 100) + '...' : str;
    }
    return String(v);
  });

  // Join with semicolons (to avoid comma issues in CSV)
  return formattedValues.join('; ');
}

/**
 * Generate CSV report
 */
function generateCSV(report: JSONReport): string {
  const lines: string[] = [];

  // Header
  lines.push([
    'Field Name',
    'Percent Present',
    'Always Present',
    'Occurrences',
    'Total Orders',
    'Value Type(s)',
    'Unique Value Count',
    'Possible Values',
    'Null Count',
    'Undefined Count',
    'Empty String Count',
    'Description'
  ].map(escapeCsvField).join(','));

  // Data rows
  for (const key of report.keys) {
    const row = [
      key.key,
      key.percentPresent.toFixed(2) + '%',
      key.isAlwaysPresent ? 'Yes' : 'No',
      String(key.occurrences),
      String(report.metadata.totalOrders),
      key.valueTypes.join('; '),
      String(key.uniqueValueCount),
      formatUniqueValues(key),
      String(key.nullCount),
      String(key.undefinedCount),
      String(key.emptyStringCount),
      key.description || '-'
    ];

    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('Generating CSV report...');

    // Read JSON report
    const inputPath = path.join(__dirname, '../analysis-output', `algolia-structure-${TARGET_DATE}.json`);
    const jsonContent = fs.readFileSync(inputPath, 'utf-8');
    const report: JSONReport = JSON.parse(jsonContent);

    console.log(`Loaded data for ${report.metadata.totalOrders} orders`);
    console.log(`Processing ${report.keys.length} unique keys...`);

    // Generate CSV
    const csv = generateCSV(report);

    // Write to file
    const outputPath = path.join(__dirname, '../analysis-output', `algolia-structure-${TARGET_DATE}.csv`);
    fs.writeFileSync(outputPath, csv);

    console.log(`✓ CSV report generated: ${outputPath}`);
    console.log(`✓ Total rows: ${report.keys.length + 1} (including header)`);

    // Count how many fields have all values listed vs "..."
    const fieldsWithAllValues = report.keys.filter(k => k.uniqueValueCount < VALUE_THRESHOLD).length;
    const fieldsWithDots = report.keys.filter(k => k.uniqueValueCount >= VALUE_THRESHOLD).length;

    console.log(`✓ Fields with all values listed: ${fieldsWithAllValues}`);
    console.log(`✓ Fields with "..." (30+ values): ${fieldsWithDots}`);

  } catch (error: any) {
    console.error('Error generating CSV:', error.message);
    process.exit(1);
  }
}

main();
