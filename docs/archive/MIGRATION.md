# Analytics Account Management Dashboard - Dual-Spreadsheet Migration Guide

## Overview

This guide provides step-by-step instructions for migrating from the legacy single-spreadsheet architecture to the new dual-spreadsheet architecture that fixes the **10 million cell limit issue**.

### The Problem

Google Sheets has a hard limit of **10 million cells per spreadsheet**. Our system was hitting this limit approximately every 30 days, causing data writes to fail and requiring manual cleanup.

### The Solution

Split data into **two spreadsheets** with different purposes:

```
┌────────────────────────────────────────────────────────┐
│ SPREADSHEET 1: Raw Data Lake (Append-Only)            │
│ "PA Orders - Raw Data Lake"                           │
│                                                        │
│ • orders_raw_hourly (complete audit trail)            │
│ • config_sync_log (sync history)                      │
│                                                        │
│ Growth: ~324,000 cells/day                            │
│ Capacity: ~30 days before archival needed             │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ SPREADSHEET 2: Dashboard Metrics (Auto-Cleaned)       │
│ "PA Analytics Dashboard - Live Metrics"               │
│                                                        │
│ • org_hourly_metrics (30-day retention)                │
│ • person_hourly_performance (30-day retention)         │
│ • daily_summary (90-day retention)                     │
│ • person_level_queues (latest only)                    │
│ • config_working_days (configuration)                  │
│                                                        │
│ Growth: Auto-cleaned via retention policy             │
│ Capacity: Always < 40k cells (0.4% of limit)          │
└────────────────────────────────────────────────────────┘
```

---

## Migration Steps

### Day 1: Emergency Setup

#### Step 1.1: Create Two New Google Spreadsheets

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet named: **"PA Orders - Raw Data Lake"**
   - Copy the spreadsheet ID from the URL (the long string after `/d/`)
   - Example: `https://docs.google.com/spreadsheets/d/ABC123.../edit`
   - Spreadsheet ID: `ABC123...`
3. Create another spreadsheet named: **"PA Analytics Dashboard - Live Metrics"**
   - Copy this spreadsheet ID as well

#### Step 1.2: Grant Service Account Access

Both new spreadsheets need Editor access for your service account:

1. In each spreadsheet, click **Share** (top-right)
2. Add the service account email: `pa-orders-sync@pa-orders-analytics.iam.gserviceaccount.com`
3. Set permission to **Editor**
4. Click **Done**

#### Step 1.3: Update Environment Variables

Edit `/account-management-dashboard/.env`:

```bash
# OLD (keep for rollback)
VITE_GOOGLE_SHEETS_ID=1foCZzx2RwBKWn01l8ooQxZrOlgI0YP5HAYLE87nYOTs

# NEW: Dual-spreadsheet architecture
VITE_RAW_DATA_SHEETS_ID=<PASTE_RAW_DATA_SHEET_ID_HERE>
VITE_DASHBOARD_SHEETS_ID=<PASTE_DASHBOARD_SHEET_ID_HERE>
```

Replace `<PASTE_RAW_DATA_SHEET_ID_HERE>` and `<PASTE_DASHBOARD_SHEET_ID_HERE>` with the IDs you copied in Step 1.1.

#### Step 1.4: Initialize Headers in New Spreadsheets

```bash
cd account-management-dashboard
npm run cli init-dual-sheets
```

This creates all 7 sheet tabs with proper headers in both spreadsheets.

**Expected Output:**
```
✅ Initialized RAW DATA LAKE sheet: orders_raw_hourly
✅ Initialized RAW DATA LAKE sheet: config_sync_log
✅ Initialized DASHBOARD sheet: org_hourly_metrics
✅ Initialized DASHBOARD sheet: person_hourly_performance
✅ Initialized DASHBOARD sheet: daily_summary
✅ Initialized DASHBOARD sheet: person_level_queues
✅ Initialized DASHBOARD sheet: config_working_days
```

#### Step 1.5: Migrate Last 7 Days of Data

```bash
npm run cli migrate -- --days 7
```

This copies the last 7 days of data from the legacy spreadsheet to the new dual-sheet structure.

**Expected Output:**
```
╔════════════════════════════════════════════════╗
║  DUAL-SPREADSHEET MIGRATION                    ║
╚════════════════════════════════════════════════╝

📄 Spreadsheet Configuration:
   Legacy: 1foCZzx2RwBKWn01l8ooQxZrOlgI0YP5HAYLE87nYOTs
   Raw Data Lake: <NEW_RAW_ID>
   Dashboard: <NEW_DASHBOARD_ID>

⏱️  Migration Mode: Last 7 days

═══════════════════════════════════════════════
STEP 1: Migrating to RAW DATA LAKE
═══════════════════════════════════════════════

📋 Migrating orders_raw_hourly...
   Filtering to keep only rows after 2026-01-27
   Filtered: 24,517/156,234 rows (last 7 days)
   ✅ Migrated 24,517 rows to orders_raw_hourly

📋 Migrating config_sync_log...
   ✅ Migrated 428 rows to config_sync_log

═══════════════════════════════════════════════
STEP 2: Migrating to DASHBOARD
═══════════════════════════════════════════════

📋 Migrating org_hourly_metrics...
   Filtering to keep only rows after 2026-01-04
   Filtered: 1,260/4,782 rows (last 30 days)
   ✅ Migrated 1,260 rows to org_hourly_metrics

... (similar output for other sheets)

╔════════════════════════════════════════════════╗
║  MIGRATION SUMMARY                             ║
╚════════════════════════════════════════════════╝

RAW DATA LAKE:
   orders_raw_hourly: 24,517 rows
   config_sync_log: 428 rows

DASHBOARD:
   org_hourly_metrics: 1,260 rows
   person_hourly_performance: 15,372 rows
   daily_summary: 360 rows
   person_level_queues: 156 rows
   config_working_days: 45 rows

Duration: 23.45s
Status: ✅ ALL VERIFIED

✅ Migration completed successfully!
```

#### Step 1.6: Verify Data in New Spreadsheets

1. Open both new spreadsheets
2. Check that all 7 sheet tabs exist
3. Spot-check a few rows to ensure data migrated correctly
4. Compare row counts with migration summary

---

### Day 2: Testing & Validation

#### Step 2.1: Test Sync with One Organization

```bash
npm run cli sync-date 2026-01-23 -- --org NYCBS --force
```

**What to Check:**
- ✅ No errors in console output
- ✅ Data appears in RAW DATA LAKE → `orders_raw_hourly`
- ✅ Metrics appear in DASHBOARD → `org_hourly_metrics`, `person_hourly_performance`, `daily_summary`
- ✅ Console shows: `✅ Appended X rows to RAW DATA LAKE` and `✅ Appended Y rows to DASHBOARD`

#### Step 2.2: Test Retention Policy (Dry-Run)

```bash
npm run cli test-retention
```

This shows what **would** be deleted without actually deleting anything.

**Expected Output:**
```
╔════════════════════════════════════════════════╗
║  RETENTION POLICY DRY-RUN TEST                 ║
╚════════════════════════════════════════════════╝

📋 org_hourly_metrics (30-day retention):
   Would delete: 0 rows older than 2026-01-04

📋 person_hourly_performance (30-day retention):
   Would delete: 0 rows older than 2026-01-04

📋 daily_summary (90-day retention):
   Would delete: 0 rows older than 2025-11-04

📋 person_level_queues (latest-only retention):
   Would delete: 0 old snapshots (keep 156 latest)

✅ Dry-run test completed (no data was deleted)
```

#### Step 2.3: Check Sheet Capacity

```bash
npm run cli check-capacity
```

**Expected Output:**
```
╔════════════════════════════════════════════════╗
║  GOOGLE SHEETS CAPACITY CHECK                  ║
╚════════════════════════════════════════════════╝

📊 Checking RAW DATA LAKE capacity...
   Total cells: 1,234,567 / 10,000,000
   Capacity: 12.35%
   Sheets:
     - orders_raw_hourly: 1,200,000 cells
     - config_sync_log: 34,567 cells
   ✅ RAW DATA LAKE capacity OK

📊 Checking DASHBOARD capacity...
   Total cells: 38,452 / 10,000,000
   Capacity: 0.38%
   Sheets:
     - org_hourly_metrics: 15,120 cells
     - person_hourly_performance: 18,486 cells
     - daily_summary: 3,060 cells
     - person_level_queues: 1,872 cells
     - config_working_days: 540 cells
   ✅ DASHBOARD capacity OK

✅ Capacity check completed
```

---

### Day 3-4: Full Sync & Retention Testing

#### Step 3.1: Run Full Sync for All Organizations

```bash
npm run cli sync
```

**What to Monitor:**
- ✅ All 4 organizations sync successfully
- ✅ Check both spreadsheets for new data
- ✅ No errors in console

#### Step 3.2: Manually Test Retention Policy (Optional)

⚠️ **WARNING:** This will actually delete old data. Only run if you want to test the cleanup logic.

```bash
npm run cli run-retention
```

**Expected Behavior:**
- Deletes rows older than retention period from DASHBOARD sheet
- Does NOT touch RAW DATA LAKE (that's append-only)

---

### Day 5-6: Scheduler Testing

#### Step 5.1: Update Frontend (If Needed)

If your frontend reads from Google Sheets directly, update it to use `VITE_DASHBOARD_SHEETS_ID` instead of `VITE_GOOGLE_SHEETS_ID`.

**Files to Check:**
- Any component that reads Google Sheets directly
- Look for imports from `./services/sheets.ts` (should use `sheets-dual.ts` now)

#### Step 5.2: Restart Scheduler

```bash
# Stop existing scheduler (if running)
pm2 stop scheduler

# Start with new dual-sheet logic
pm2 start npm --name "scheduler" -- run scheduler

# Check logs
pm2 logs scheduler
```

**What to Look For in Logs:**
```
=== Data Source Configuration ===
  Primary Source: ALGOLIA
  Firestore Fallback: Enabled
  Max Retries: 3
  Algolia Timeout: 30000ms
=================================
=== Google Sheets Configuration ===
  Mode: DUAL-SPREADSHEET (cell limit fix enabled)
  Raw Data Sheet: <YOUR_RAW_ID>
  Dashboard Sheet: <YOUR_DASHBOARD_ID>
====================================
```

#### Step 5.3: Verify Scheduled Jobs

The scheduler should now have **2 new jobs**:

```
📊 Daily Metrics Sync Schedules:
   ✓ 12:00 AM IST (0 0 * * *) - Previous day (if workday)
   ✓ 05:00 AM IST (0 5 * * *) - Previous day (if workday)
   ✓ 10:00 AM IST (0 10 * * *) - Current day (if workday)
   ... (same as before)

🗑️  Retention Policy Cleanup Schedule:
   ✓ 03:00 AM IST (0 3 * * *) - Delete old data from DASHBOARD sheet
      • org_hourly_metrics: Keep last 30 days
      • person_hourly_performance: Keep last 30 days
      • daily_summary: Keep last 90 days
      • person_level_queues: Keep only latest snapshot per person

📊 Sheet Capacity Monitoring Schedule:
   ✓ 09:00 AM IST (0 9 * * *) - Check cell counts and send alerts if needed
      • RAW DATA LAKE: Alert if > 80% capacity (8M cells)
      • DASHBOARD: Alert if > 100k cells (retention issue)
```

---

### Day 7: Go Live & Monitoring

#### Step 7.1: Final Verification Checklist

- [ ] Both new spreadsheets exist and have correct permissions
- [ ] Environment variables configured (`VITE_RAW_DATA_SHEETS_ID`, `VITE_DASHBOARD_SHEETS_ID`)
- [ ] Last 7 days of data migrated successfully
- [ ] Test sync completed without errors
- [ ] Retention policy tested (dry-run)
- [ ] Capacity check shows healthy numbers (< 40k cells in DASHBOARD)
- [ ] Scheduler restarted with new logic
- [ ] Dashboard frontend displays current data
- [ ] Old spreadsheet backed up (just in case)

#### Step 7.2: Monitor for 24 Hours

**Things to Check Daily:**
1. `pm2 logs scheduler` - no errors
2. Check cell capacity: `npm run cli check-capacity`
3. Verify dashboard data is updating
4. Check Slack for capacity alerts (should receive none if all is well)

#### Step 7.3: Weekly Monitoring

**Every Monday Morning:**
```bash
# Check cell capacity
npm run cli check-capacity

# Verify DASHBOARD stays small
npm run cli dashboard-cells
```

**Expected DASHBOARD Cell Count:**
- Week 1: ~35,000 cells
- Week 2: ~36,000 cells (grows slowly)
- Week 3: ~37,000 cells
- Week 4: ~38,000 cells (then retention cleanup brings it back down)

**If DASHBOARD exceeds 100k cells:**
- ⚠️ Retention policy is NOT running correctly
- Check scheduler logs: `pm2 logs scheduler | grep retention`
- Manually run retention: `npm run cli run-retention`

---

## Rollback Procedure

If critical issues arise, revert to the legacy single spreadsheet:

### Step 1: Stop Scheduler

```bash
pm2 stop scheduler
```

### Step 2: Revert Environment Variables

Edit `.env`:

```bash
# Comment out new IDs
# VITE_RAW_DATA_SHEETS_ID=...
# VITE_DASHBOARD_SHEETS_ID=...

# Use old ID
VITE_GOOGLE_SHEETS_ID=1foCZzx2RwBKWn01l8ooQxZrOlgI0YP5HAYLE87nYOTs
```

### Step 3: Revert Code Changes

```bash
cd account-management-dashboard
git checkout src/services/sync.ts
git checkout src/cli.ts
git checkout src/scheduler.ts
```

### Step 4: Restart Scheduler

```bash
pm2 restart scheduler
```

---

## Troubleshooting

### Issue: "DASHBOARD_SHEETS_ID not configured"

**Cause:** Environment variable not set or not loaded.

**Fix:**
1. Check `.env` file has `VITE_DASHBOARD_SHEETS_ID=...`
2. Restart scheduler: `pm2 restart scheduler`
3. If using terminal, reload env: `source ~/.bashrc` or `source ~/.zshrc`

### Issue: Migration Fails with "Sheet not found"

**Cause:** Headers not initialized in new spreadsheets.

**Fix:**
```bash
npm run cli init-dual-sheets
```

### Issue: Retention Policy Deletes Too Much Data

**Cause:** Incorrect date column index or retention period.

**Fix:**
1. Check `src/services/sheets-retention.ts` → `RETENTION_POLICIES`
2. Verify date column indices match sheet structure
3. Test with dry-run first: `npm run cli test-retention`

### Issue: Slack Alerts for Capacity Warnings

**Meaning:** RAW DATA LAKE is at 80%+ capacity.

**Action Required:**
1. Archive old data from `orders_raw_hourly` (data older than 60 days)
2. Move archived data to a separate "PA Orders - Archive YYYY-MM" spreadsheet
3. Delete archived rows from RAW DATA LAKE

### Issue: Duplicate Data in Sheets

**Cause:** Sync ran twice for the same date/hour.

**Prevention:**
- Sync cooldown logic should prevent this
- If it happens, it's a bug in cooldown logic

**Fix:**
1. Stop scheduler
2. Manually deduplicate data (keep latest snapshot per order_id)
3. Fix cooldown logic in `src/server/api.ts`

---

## FAQ

### Q: Will this fix completely eliminate the cell limit issue?

**A:** For the DASHBOARD sheet, **yes** - it will stay under 40k cells forever due to auto-retention. For the RAW DATA LAKE, you'll need to archive old data every ~25-30 days, but this is a manageable process.

### Q: What happens to the old legacy spreadsheet?

**A:** Keep it as a backup for at least 30 days after migration. Once you're confident the new system is stable, you can archive or delete it.

### Q: Can I migrate ALL historical data?

**A:** Yes, use `npm run cli migrate -- --all`, but be aware this could take several minutes and result in a very large RAW DATA LAKE sheet. It's better to start with 7 days and backfill more if needed.

### Q: How do I archive old data from RAW DATA LAKE?

**Steps:**
1. Create a new spreadsheet: "PA Orders - Archive 2025-12"
2. Copy rows from `orders_raw_hourly` older than 60 days
3. Verify row counts match
4. Delete old rows from RAW DATA LAKE

### Q: What if retention policy stops working?

**Symptoms:**
- DASHBOARD cell count keeps growing (>100k cells)
- Slack alert: "DASHBOARD sheet unexpectedly large"

**Diagnosis:**
```bash
# Check if retention job is scheduled
pm2 logs scheduler | grep "Retention Policy"

# Manually test retention
npm run cli test-retention
```

**Fix:**
- If job not running, check scheduler.ts has `retentionJob` scheduled at 3 AM IST
- Manually run: `npm run cli run-retention`

---

## Success Metrics

After 1 week, you should see:

✅ **DASHBOARD sheet stays under 40k cells**
✅ **RAW DATA LAKE grows predictably (~324k cells/day)**
✅ **No cell limit errors in logs**
✅ **Data syncs complete successfully 9 times per day**
✅ **Retention policy runs daily at 3 AM IST without errors**
✅ **Capacity monitoring alerts (if any) are actionable**

---

## Next Steps (Post-Week 1)

Once the system is stable for 1 week, consider:

1. **Cloud Migration (Optional):** Migrate from local scheduler to Cloud Functions + Cloud Scheduler for 99.95% SLA
2. **Idempotent Writes:** Implement upsert pattern for all sheets to eliminate duplicate data
3. **Advanced Monitoring:** Set up Cloud Monitoring dashboards for sync success rate, data freshness, etc.
4. **Automated Archival:** Create a script to automatically archive RAW DATA older than 60 days

---

## Support

For issues or questions:

1. Check this MIGRATION.md guide first
2. Review logs: `pm2 logs scheduler`
3. Test commands manually (see CLI commands above)
4. If still stuck, contact the team with:
   - Error message
   - Command you ran
   - Relevant log output
   - Screenshots of spreadsheet state

---

**Document Version:** 1.0
**Last Updated:** 2026-02-03
**Author:** Claude Code (with human review)
