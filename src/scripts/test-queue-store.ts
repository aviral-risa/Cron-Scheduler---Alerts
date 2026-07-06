/**
 * Test script to verify queue_daily_log storage works
 */

import 'dotenv/config';
import { appendQueueDailyLog, getLatestFromQueueDailyLog } from '../services/sheets-dual';

const testSnapshots = [
  {
    snapshot_timestamp: '2026-02-04 23:59:00',
    snapshot_date: '2026-02-04',
    snapshot_hour: '23',
    person_name: 'Test User',
    person_id: 'test-123',
    facility_id: 'test-facility',
    new: 5,
    pending: 10,
    query: 3,
    hold: 2,
    auth_required: 1,
    total_open_orders: 21,
  }
];

async function test() {
  console.log('Testing appendQueueDailyLog...');
  await appendQueueDailyLog(testSnapshots);
  console.log('Store complete!');
  
  console.log('\nTesting getLatestFromQueueDailyLog...');
  const result = await getLatestFromQueueDailyLog();
  console.log('Read result:', result);
}

test().catch(console.error);
