/**
 * Script to fetch data from Google Sheets and calculate Authorization Rate
 * Shows the exact math behind the 24.1% value
 */

import { getDailySummaryForRange } from './src/services/sheets.js';

async function calculateAuthRate() {
  console.log('Fetching data from Google Sheets...\n');

  // Fetch data for the last 7 days (adjust date range as needed)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get all facilities
  const facilityIds = [
    'HhwIHO4npKhrxyylkC33',
    '4BlQ4SsqAVTDgFKApKZr',
    '3GKbZtgpPru1vJGCkxwR',
    'W14MolgUu7OYvX4CFQJn'
  ];

  const summaries = await getDailySummaryForRange(facilityIds, startDate, endDate);

  if (summaries.length === 0) {
    console.log('❌ No data found in sheets for this date range');
    return;
  }

  console.log(`✅ Found ${summaries.length} daily summary records\n`);

  // Aggregate the status counts
  let authByRisa = 0;
  let authOnFile = 0;
  let noAuthRequired = 0;
  let denialByRisa = 0;
  let denialAfterQuery = 0;

  summaries.forEach(summary => {
    authByRisa += summary.status_auth_by_risa;
    authOnFile += summary.status_auth_on_file;
    noAuthRequired += summary.status_no_auth_required;
    denialByRisa += summary.status_denial_by_risa;
    denialAfterQuery += summary.status_denial_after_query;
  });

  console.log('📊 RAW STATUS COUNTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Auth by RISA:           ${authByRisa.toLocaleString()}`);
  console.log(`Auth on File:           ${authOnFile.toLocaleString()}`);
  console.log(`No Auth Required (NAR): ${noAuthRequired.toLocaleString()}`);
  console.log(`Denial by RISA:         ${denialByRisa.toLocaleString()}`);
  console.log(`Denial after Query:     ${denialAfterQuery.toLocaleString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Calculate Authorization Rate
  const totalAuthorized = authByRisa + authOnFile + noAuthRequired;
  const totalDenied = denialByRisa + denialAfterQuery;
  const total = totalAuthorized + totalDenied;

  console.log('🧮 AUTHORIZATION RATE CALCULATION:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Authorized = Auth by RISA + Auth on File + NAR`);
  console.log(`                 = ${authByRisa.toLocaleString()} + ${authOnFile.toLocaleString()} + ${noAuthRequired.toLocaleString()}`);
  console.log(`                 = ${totalAuthorized.toLocaleString()}\n`);

  console.log(`Total Denied = Denial by RISA + Denial after Query`);
  console.log(`             = ${denialByRisa.toLocaleString()} + ${denialAfterQuery.toLocaleString()}`);
  console.log(`             = ${totalDenied.toLocaleString()}\n`);

  console.log(`Total = ${totalAuthorized.toLocaleString()} + ${totalDenied.toLocaleString()} = ${total.toLocaleString()}\n`);

  if (total === 0) {
    console.log('❌ Cannot calculate authorization rate (division by zero)');
    return;
  }

  const authRate = ((totalAuthorized / total) * 100).toFixed(1);

  console.log(`Authorization Rate = (${totalAuthorized.toLocaleString()} / ${total.toLocaleString()}) × 100`);
  console.log(`                   = ${authRate}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`🎯 FINAL RESULT: ${authRate}%\n`);

  // Show breakdown by percentage
  const authorizedPct = ((totalAuthorized / total) * 100).toFixed(1);
  const deniedPct = ((totalDenied / total) * 100).toFixed(1);

  console.log('📈 BREAKDOWN:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Authorized: ${authorizedPct}% (${totalAuthorized.toLocaleString()} orders)`);
  console.log(`Denied:     ${deniedPct}% (${totalDenied.toLocaleString()} orders)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

calculateAuthRate().catch(console.error);
