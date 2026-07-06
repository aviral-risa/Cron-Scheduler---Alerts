import 'dotenv/config';
import { onRequest } from 'firebase-functions/v2/https';
import { syncOrderData, isWorkingDay } from '../services/sync';
import { toISTHour } from '../utils/timezone';

/**
 * Cloud Function: Hourly sync for PA Orders Analytics
 *
 * Schedule: Runs every hour (24/7) via Cloud Scheduler
 * Timezone: Asia/Kolkata (IST)
 *
 * Date Logic:
 * - Hours 0-5 AM IST: Sync yesterday's orders (final snapshots for previous day)
 * - Hours 6-23 IST: Sync today's orders (current snapshots)
 *
 * Working Day Check:
 * - Checks config_working_days sheet before syncing
 * - Skips sync if target date is not a working day
 *
 * Example Timeline:
 * - Jan 5, 6:00 AM → Sync Jan 5 (start of day)
 * - Jan 5, 10:00 AM → Sync Jan 5 (mid-morning update)
 * - Jan 6, 2:00 AM → Sync Jan 5 (late night orders, final snapshot)
 * - Jan 6, 6:00 AM → Sync Jan 6 (start new day)
 */
export const hourlysyncorders = onRequest(
  {
    timeoutSeconds: 540, // 9 minutes
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      const now = new Date();
      console.log(`Hourly sync triggered at: ${now.toISOString()}`);

      // Determine which date to sync based on IST hour
      // Hours 0-5 AM IST: sync yesterday's orders (final snapshots)
      // Hours 6-23 IST: sync today's orders
      const istHour = toISTHour(now);
      let targetDate = new Date(now);

      if (istHour >= 0 && istHour < 6) {
        targetDate.setDate(targetDate.getDate() - 1);
        console.log(`IST hour ${istHour} - syncing previous day's orders`);
      } else {
        console.log(`IST hour ${istHour} - syncing today's orders`);
      }

      const targetDateStr = targetDate.toISOString().split('T')[0];
      console.log(`Target date for sync: ${targetDateStr}`);

      // Check if target date is a working day
      const isWorking = await isWorkingDay(targetDate);
      if (!isWorking) {
        console.log(`${targetDateStr} is not a working day (weekend/holiday), skipping sync`);
        res.status(200).json({
          status: 'skipped',
          reason: 'not_working_day',
          date: targetDateStr,
          istHour: istHour,
          timestamp: now.toISOString()
        });
        return;
      }

      console.log(`${targetDateStr} is a working day, proceeding with sync`);

      // Run sync (force=true to override working day check in syncOrderData)
      console.log(`Starting hourly sync for ${targetDateStr}`);
      await syncOrderData(targetDate, true); // force=true since we already checked

      console.log(`✓ Hourly sync completed successfully for ${targetDateStr}`);
      res.status(200).json({
        status: 'success',
        date: targetDateStr,
        istHour: istHour,
        timestamp: now.toISOString()
      });
    } catch (error: any) {
      console.error('Hourly sync failed:', error);
      res.status(500).json({
        status: 'error',
        error: error?.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }
);
