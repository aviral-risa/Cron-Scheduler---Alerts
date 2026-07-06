import 'dotenv/config';
import { google } from 'googleapis';

// Support both browser (import.meta.env) and Node.js (process.env)
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return process.env[key];
};

const SHEETS_ID = getEnv('VITE_GOOGLE_SHEETS_ID');

/**
 * Discover all unique master_auth_status values from orders_raw_hourly sheet
 */
async function discoverStatusValues() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Fetching data from orders_raw_hourly sheet...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: 'orders_raw_hourly!F:F', // Column F is master_auth_status
  });

  const rows = response.data.values || [];

  // Skip header row and collect unique values
  const statusValues = new Set<string>();
  const statusCounts = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][0];
    if (status) {
      statusValues.add(status);
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
  }

  console.log('\n=== MASTER_AUTH_STATUS VALUES FOUND ===');
  console.log(`Total unique values: ${statusValues.size}`);
  console.log(`Total orders analyzed: ${rows.length - 1}\n`);

  // Sort by count (descending)
  const sortedStatuses = Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('Status values (sorted by frequency):\n');
  sortedStatuses.forEach(([status, count]) => {
    const percentage = ((count / (rows.length - 1)) * 100).toFixed(2);
    console.log(`  ${status.padEnd(30)} ${count.toString().padStart(6)} orders (${percentage}%)`);
  });

  console.log('\n=== RECOMMENDED SCHEMA ===');
  console.log('Based on the data, these columns should be added to DailySummary:\n');

  sortedStatuses.forEach(([status, count], index) => {
    const percentage = ((count / (rows.length - 1)) * 100);
    if (percentage >= 1) { // Show statuses that represent >= 1% of orders
      const fieldName = `status_${status.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      console.log(`  ${fieldName}: number; // ${status} (${percentage.toFixed(1)}% of orders)`);
    }
  });

  console.log('\n  status_other: number; // All other statuses');
}

discoverStatusValues().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
