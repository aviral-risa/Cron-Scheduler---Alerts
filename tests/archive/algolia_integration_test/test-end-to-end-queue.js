/**
 * End-to-End Test for Queue View Data Flow
 *
 * This script simulates exactly what happens when a user:
 * 1. Opens the Queue view
 * 2. Clicks "Fetch Fresh Data"
 * 3. Data is fetched from Algolia
 * 4. Data is stored to Google Sheets
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials from .env in parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Team members configuration (from team-members.ts)
const TEAM_MEMBERS = [
  { name: 'Anurag', id: '74jlfvFzQ3RaoejElo9T1wqxl0f2', organization: 'NYCBS' },
  { name: 'Rishab', id: 'gM7rFq7MOmW81jCn8KKJZMHEhAK2', organization: 'NYCBS' },
  { name: 'Sohini', id: 'qxb4Gk9fQ0M2XrDsFW3EtaIQW0C3', organization: 'CHC' },
  { name: 'Zubiya', id: '4oPmDy0XWxgMkkPCXEEEXNQqx8j2', organization: 'CHC' },
  { name: 'Renuka Perumal', id: 'Qv5M1t4TjccZzqGY6KAVZAzDNOm1', organization: 'MBPCC' },
  { name: 'Hariharan', id: 'bvg13vb9r9e6qMoI1nMc5ohLXoG2', organization: 'MBPCC' },
  { name: 'Praveen', id: 'W3uM7bGI7efzp9PXY61FS3Yaqfv1', organization: 'UCBC' },
];

// Organization to facility ID mapping (from team-members.ts)
const ORG_TO_FACILITY_ID = {
  'NYCBS': 'rLV9F4BvwJmyfRtN98zB',
  'CHC': '7oN3uYo93jw5r3nMdJz0',
  'MBPCC': 'v40M5Fk3FYAiXRlHVDjZ',
  'UCBC': 'eWIK81FCb0kXq3KMrL5a',
};

// API endpoints
const AUTH_URL = 'https://authentication.risalabs.ai/api/v1/user-auth/token';
const ALGOLIA_URL = 'https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-multi-facet-counts';
const BACKEND_STORE_URL = 'http://localhost:3001/api/queue/store';

const { ALGOLIA_USERNAME, ALGOLIA_PASSWORD } = process.env;

/**
 * Step 1: Authenticate with Algolia
 */
async function authenticate() {
  console.log('\n=== Step 1: Authenticating with Algolia ===');

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ALGOLIA_USERNAME,
      password: ALGOLIA_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✓ Authentication successful');
  console.log(`  Token expires in: ${data.expiration_time} seconds`);

  return data.access_token;
}

/**
 * Step 2: Fetch queue counts for a person in an organization
 */
async function fetchPersonQueueCounts(token, facilityId, personId, personName) {
  console.log(`\n  Fetching queue for: ${personName} (${personId})`);

  const response = await fetch(ALGOLIA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      org_id: facilityId,
      facet_attribute: 'master_auth_status',
      assigned_to: personId,
    }),
  });

  if (!response.ok) {
    console.error(`  ✗ Failed to fetch for ${personName}: ${response.statusText}`);
    return null;
  }

  const data = await response.json();

  if (!data.success) {
    console.error(`  ✗ API returned error for ${personName}:`, data.error);
    return null;
  }

  const facetCounts = data.facet_counts || {};

  const queueData = {
    personName,
    personId,
    facilityId,
    new: facetCounts['new'] || 0,
    pending: facetCounts['pending'] || 0,
    query: facetCounts['query'] || 0,
    hold: facetCounts['hold'] || 0,
    authRequired: facetCounts['auth required'] || facetCounts['auth_required'] || 0,
    totalOpenOrders: 0,
  };

  // Calculate total
  queueData.totalOpenOrders = queueData.new + queueData.pending +
                                queueData.query + queueData.hold + queueData.authRequired;

  console.log(`  ✓ Queue data: New=${queueData.new}, Pending=${queueData.pending}, Query=${queueData.query}, Hold=${queueData.hold}, AuthReq=${queueData.authRequired}, Total=${queueData.totalOpenOrders}`);

  return queueData;
}

/**
 * Step 3: Fetch queue data for all team members grouped by organization
 */
async function fetchAllQueueData(token) {
  console.log('\n=== Step 2: Fetching Queue Data from Algolia ===');

  // Group team members by organization
  const orgGroups = new Map();
  TEAM_MEMBERS.forEach(member => {
    if (!orgGroups.has(member.organization)) {
      orgGroups.set(member.organization, []);
    }
    orgGroups.get(member.organization).push(member);
  });

  console.log(`Grouped ${TEAM_MEMBERS.length} team members into ${orgGroups.size} organizations`);

  const allData = [];

  // Fetch for each organization
  for (const [orgName, members] of orgGroups) {
    const facilityId = ORG_TO_FACILITY_ID[orgName];

    if (!facilityId) {
      console.warn(`\n⚠ No facility ID found for organization: ${orgName}, skipping...`);
      continue;
    }

    console.log(`\n--- Fetching for ${orgName} (${facilityId}) - ${members.length} members ---`);

    for (const member of members) {
      const queueData = await fetchPersonQueueCounts(token, facilityId, member.id, member.name);
      if (queueData) {
        allData.push(queueData);
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n✓ Total queue data fetched: ${allData.length} entries`);
  return allData;
}

/**
 * Step 4: Store queue data to Google Sheets via backend API
 */
async function storeToGoogleSheets(queueData) {
  console.log('\n=== Step 3: Storing Data to Google Sheets ===');

  // Generate IST timestamp (same logic as useQueueData.ts)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  const timestamp = istTime.toISOString().replace('T', ' ').substring(0, 19);
  const date = istTime.toISOString().split('T')[0];
  const hour = istTime.getHours().toString().padStart(2, '0') + ':00';

  // Convert to PersonQueueSnapshot format
  const snapshots = queueData.map(d => ({
    snapshot_timestamp: timestamp,
    snapshot_date: date,
    snapshot_hour: hour,
    person_name: d.personName,
    person_id: d.personId,
    facility_id: d.facilityId,
    new: d.new,
    pending: d.pending,
    query: d.query,
    hold: d.hold,
    auth_required: d.authRequired,
    total_open_orders: d.totalOpenOrders,
  }));

  console.log(`Storing ${snapshots.length} snapshots with timestamp: ${timestamp}`);

  const response = await fetch(BACKEND_STORE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ snapshots }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to store to sheets: ${response.statusText}\n${errorText}`);
  }

  const result = await response.json();
  console.log('✓ Successfully stored to Google Sheets:', result);

  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     End-to-End Queue View Data Flow Test                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Authenticate
    const token = await authenticate();

    // Step 2: Fetch all queue data
    const queueData = await fetchAllQueueData(token);

    if (queueData.length === 0) {
      console.error('\n✗ No queue data was fetched. Cannot proceed to storage.');
      process.exit(1);
    }

    // Step 3: Store to Google Sheets
    await storeToGoogleSheets(queueData);

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`✓ Successfully completed end-to-end test`);
    console.log(`  - Authenticated with Algolia`);
    console.log(`  - Fetched queue data for ${queueData.length} team members`);
    console.log(`  - Stored data to person_level_queues sheet`);

    // Calculate totals
    const totals = queueData.reduce((acc, d) => ({
      new: acc.new + d.new,
      pending: acc.pending + d.pending,
      query: acc.query + d.query,
      hold: acc.hold + d.hold,
      authRequired: acc.authRequired + d.authRequired,
      totalOpenOrders: acc.totalOpenOrders + d.totalOpenOrders,
    }), { new: 0, pending: 0, query: 0, hold: 0, authRequired: 0, totalOpenOrders: 0 });

    console.log(`\n  Total Orders Across All Team Members:`);
    console.log(`    - New: ${totals.new}`);
    console.log(`    - Pending: ${totals.pending}`);
    console.log(`    - Query: ${totals.query}`);
    console.log(`    - Hold: ${totals.hold}`);
    console.log(`    - Auth Required: ${totals.authRequired}`);
    console.log(`    - Total Open Orders: ${totals.totalOpenOrders}`);

    console.log('\n✓ The person_level_queues sheet should now have data!');
    console.log('  Open the Google Sheet to verify the data was written.\n');

  } catch (error) {
    console.error('\n✗ Test failed with error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
main();
