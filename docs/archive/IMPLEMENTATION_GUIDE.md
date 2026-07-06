# Business Metrics Implementation Guide

## ✅ What Was Implemented

### 1. **New Sheets Architecture**
- **business_metrics_daily**: Pre-calculated org × date metrics (UNIQUE_STATUS spreadsheet)
- **unique_orders_archive**: Historical orders > 14 days old (ARCHIVE spreadsheet v1/v2/v3)

### 2. **14-Day Rolling Window**
- unique_orders_status maintains only last 14 days
- Old orders automatically archived daily at 3 AM IST
- Prevents 10M cell limit exhaustion

### 3. **Automatic Metrics Calculation**
- Business metrics calculated after each sync
- No manual intervention needed
- Backward compatible with existing daily_summary

---

## 📊 Spreadsheet Architecture

```
UNIQUE_STATUS Spreadsheet (19mRsj9X...)
├─ unique_orders_status (14-day window) → 3.64M cells
└─ business_metrics_daily (permanent) → 58k cells/year
   Total: ~3.7M cells ✅ SAFE

ARCHIVE_V1 Spreadsheet (1XrWrXE9...)
└─ unique_orders_archive (append-only) → ~250k orders capacity
   Switch to V2 when full

ARCHIVE_V2 Spreadsheet (1ICqNCV9...)
└─ unique_orders_archive (append-only) → ~250k orders capacity
   Switch to V3 when full

ARCHIVE_V3 Spreadsheet (1vtaM_ZG...)
└─ unique_orders_archive (append-only) → ~250k orders capacity
   Final archive version

RAW_DATA Spreadsheet (19D83Ol...)
└─ orders_raw_hourly (30-day retention) → 9.7M cells
   Total: ~9.7M cells ✅ SAFE (no longer stores archive)
```

---

## 🚀 Step-by-Step Setup (Run in Order)

### **Step 1: Initialize business_metrics_daily Sheet**

```bash
npm run cli init-business-metrics-sheet
```

**Expected Output:**
```
✅ business_metrics_daily sheet initialized successfully
   Spreadsheet ID: 19mRsj9X2tXJb8t1zqinHysQbzlndyeKpxgdL5gaQqbc
   Columns: 20 (20 columns)
```

**What it does:**
- Creates new sheet tab in UNIQUE_STATUS spreadsheet
- Sets up 20-column schema with headers
- Applies formatting (bold header, frozen row)

---

### **Step 2: Initialize unique_orders_archive Sheet**

```bash
npm run cli init-unique-orders-archive-sheet
```

**Expected Output:**
```
Archive Version: v1
Spreadsheet ID: 1XrWrXE9jbBoQNGP2DqAOggRRbjC3nr1UzSH9KnoKNgM
✅ unique_orders_archive sheet initialized successfully
   Columns: 40 (same as unique_orders_status)
```

**What it does:**
- Creates new sheet tab in ARCHIVE_V1 spreadsheet
- Same 40-column schema as unique_orders_status
- Large capacity (100,000 rows) for historical data

---

### **Step 3: Backfill Last 14 Days**

```bash
npm run cli backfill-business-metrics
```

**Expected Output:**
```
Processing 2026-01-21 (Day 1/14)
[CHC] ✅ Processed 1,234 orders for 2026-01-21
[NYCBS] ✅ Processed 876 orders for 2026-01-21
...
Total date-facility combinations processed: 56
Success rate: 100%
```

**What it does:**
- Reads unique_orders_status for last 14 days
- Calculates business metrics for each facility × date
- Writes to business_metrics_daily sheet
- Expected: 56 rows (4 facilities × 14 days)

---

### **Step 4: Verify Data**

#### Check business_metrics_daily:
```bash
# Open in browser
https://docs.google.com/spreadsheets/d/19mRsj9X2tXJb8t1zqinHysQbzlndyeKpxgdL5gaQqbc
```

**Verify:**
- ✅ Sheet has 56 rows (4 facilities × 14 days)
- ✅ Columns: created_at_date, facility_id, total_orders, etc.
- ✅ Dates range from 14 days ago to today
- ✅ Each facility has 14 rows

#### Check unique_orders_archive:
```bash
# Open in browser
https://docs.google.com/spreadsheets/d/1XrWrXE9jbBoQNGP2DqAOggRRbjC3nr1UzSH9KnoKNgM
```

**Verify:**
- ✅ Sheet exists with 40-column headers
- ⚠️ Currently empty (will populate after first retention run)

---

### **Step 5: Test Retention Policy (Dry-Run)**

```bash
npm run cli test-retention
```

**Expected Output:**
```
📋 unique_orders_archive (14-day archival):
   Would archive: 0 orders (none older than 14 days yet)
```

**What it does:**
- Shows what would be archived without actually doing it
- Safe to run multiple times
- Helps verify archival logic

---

### **Step 6: Run First Archival (Optional - Runs Daily Automatically)**

```bash
npm run cli run-retention
```

**Expected Output:**
```
🗃️  Archival for unique_orders_status: moving rows older than 2026-01-20 (14 days)
   Found 0 orders to archive (older than cutoff)
   ✅ No old orders to archive
```

**What it does:**
- Archives orders > 14 days old to unique_orders_archive
- Runs automatically at 3 AM IST daily
- Only needed manually if you want to test now

---

## 📈 Ongoing Operations

### Daily Automatic Process (Configured in Scheduler)

```
3:00 AM IST - Retention Cleanup
├─ Archive orders > 14 days old
├─ Clean org_hourly_metrics (30 days)
├─ Clean person_hourly_performance (30 days)
└─ Clean daily_summary (90 days)

9x Daily (12 AM, 5 AM, 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM)
├─ Sync order data from Algolia
├─ Calculate business metrics
└─ Write to business_metrics_daily
```

### Monitoring Commands

```bash
# Check capacity usage
npm run cli check-capacity

# Check DASHBOARD cell count
npm run cli dashboard-cells

# Test retention policy
npm run cli test-retention

# Manual retention run
npm run cli run-retention
```

---

## 🔄 Switching Archive Versions

When **ARCHIVE_V1 reaches ~9M cells** (check via Google Sheets):

### 1. Update .env file:
```bash
# Change this line:
VITE_CURRENT_ARCHIVE_VERSION=v2  # was v1
```

### 2. Initialize new archive sheet:
```bash
npm run cli init-unique-orders-archive-sheet
```

**Expected Output:**
```
Archive Version: v2
Spreadsheet ID: 1ICqNCV9AAoZeVF5UzpBm2EX-5n_YAolqxiaCYahOQ2A
✅ unique_orders_archive sheet initialized successfully
```

### 3. Restart scheduler:
```bash
# Stop scheduler
pm2 stop account-dashboard-scheduler

# Start scheduler (picks up new env)
pm2 start account-dashboard-scheduler
```

**Notes:**
- V1 remains intact (read-only archive)
- New orders archive to V2
- Repeat for V3 when V2 fills up

---

## 📊 Schema Reference

### business_metrics_daily (20 columns)

| Column | Type | Description |
|--------|------|-------------|
| created_at_date | string | Date of orders (IST) |
| facility_id | string | Organization ID (CHC, NYCBS, etc.) |
| total_orders | number | Total count of orders |
| orders_assigned | number | Count with assigned_to_name |
| orders_completed | number | Count with mark_as_completed = true |
| status_auth_by_risa | number | Auth by RISA count |
| status_auth_on_file | number | Auth on file count |
| status_no_auth_required | number | No auth required count |
| status_denial_by_risa | number | Denial by RISA count |
| status_denial_after_query | number | Denial after query count |
| status_existing_denial | number | Existing denial count |
| status_query | number | Query status count |
| status_pending | number | Pending status count |
| status_hold | number | Hold status count |
| status_auth_required | number | Auth required count |
| status_other | number | Other statuses count |
| approval_rate_pct | number | Auth / (Auth + Denial) × 100 |
| authorization_rate_pct | number | (Auth + AOF + NAR) / Total × 100 |
| work_rate_pct | number | Completed / Total × 100 |
| last_updated_timestamp | string | When calculated (IST) |

---

## ⚠️ Troubleshooting

### Issue: "UNIQUE_STATUS_SHEETS_ID not configured"
**Solution:** Check .env file has:
```
VITE_UNIQUE_STATUS_SHEETS_ID=19mRsj9X2tXJb8t1zqinHysQbzlndyeKpxgdL5gaQqbc
```

### Issue: "No orders found for backfill"
**Solution:**
1. Check unique_orders_status has data
2. Verify ENABLE_UNIQUE_ORDER_STATUS_SYNC=true
3. Run sync first: `npm run cli sync-date 2026-02-03 -- --sync-unique-status`

### Issue: "Archive sheet already exists"
**Solution:** This is OK - sheet was already created. Continue to next step.

### Issue: Backfill shows 0 orders
**Solution:**
1. Check unique_orders_status has data for the date
2. Verify org_id matches (CHC, NYCBS, MBPCC, UCBC)
3. Check created_at_iso dates match the backfill range

---

## 🎯 Success Criteria

✅ **business_metrics_daily**
- Has 56 rows (4 facilities × 14 days)
- Dates range from 14 days ago to today
- total_orders matches unique_orders_status counts

✅ **unique_orders_archive**
- Sheet exists with 40 columns
- Will populate after first retention run (3 AM IST)

✅ **Capacity**
- UNIQUE_STATUS: ~3.7M cells (37% of limit)
- ARCHIVE_V1: < 1M cells initially (grows 9.5M/year)
- RAW_DATA: ~9.7M cells (unchanged)

✅ **Automation**
- Business metrics calculated after each sync
- Archival runs daily at 3 AM IST
- No manual intervention needed

---

## 📞 Next Steps

1. ✅ Run initialization scripts (Steps 1-3 above)
2. ✅ Verify data (Step 4)
3. ⏸️ Update Frontend (Out of Scope)
   - Modify Business View to query business_metrics_daily
   - Add new API endpoint
   - Make Business View default route
4. 🔄 Monitor capacity after 1 month
5. 📊 Plan V2 archive switch (~1 year from now)

---

## 🛟 Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Run `npm run cli check-capacity` to verify cell counts
3. Check logs in terminal for error messages
4. Verify environment variables in .env file
