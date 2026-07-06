# Quick Start - Dual-Spreadsheet Migration

**🚀 Get the system running in 30 minutes**

## Prerequisites

- [ ] You have Editor access to Google Sheets
- [ ] Service account credentials configured in `.env`
- [ ] Node.js and npm installed
- [ ] Scheduler currently stopped (or can be stopped)

---

## Step 1: Create Spreadsheets (5 min)

1. Go to [Google Sheets](https://sheets.google.com)
2. Create: **"PA Orders - Raw Data Lake"**
   - Copy spreadsheet ID from URL
3. Create: **"PA Analytics Dashboard - Live Metrics"**
   - Copy spreadsheet ID from URL
4. Share both with: `pa-orders-sync@pa-orders-analytics.iam.gserviceaccount.com` (Editor access)

---

## Step 2: Update .env (2 min)

```bash
cd account-management-dashboard
nano .env
```

Add these lines:

```bash
VITE_RAW_DATA_SHEETS_ID=<YOUR_RAW_DATA_SHEET_ID>
VITE_DASHBOARD_SHEETS_ID=<YOUR_DASHBOARD_SHEET_ID>
```

Save and exit.

---

## Step 3: Initialize Headers (1 min)

```bash
npm run cli init-dual-sheets
```

✅ Should see: "Initialized RAW DATA LAKE sheet" and "Initialized DASHBOARD sheet" messages.

---

## Step 4: Migrate Data (5 min)

```bash
npm run cli migrate -- --days 7
```

✅ Should see: "Migration completed successfully!" at the end.

---

## Step 5: Verify (5 min)

```bash
# Check both spreadsheets have data
npm run cli check-capacity

# Test a sync
npm run cli sync-date 2026-01-23 -- --org NYCBS --force
```

✅ No errors = success!

---

## Step 6: Restart Scheduler (2 min)

```bash
pm2 stop scheduler
pm2 start npm --name "scheduler" -- run scheduler
pm2 logs scheduler --lines 50
```

✅ Look for: "Mode: DUAL-SPREADSHEET (cell limit fix enabled)"

---

## Step 7: Monitor (10 min)

Open both new spreadsheets and verify:
- [ ] Data is being written
- [ ] Cell counts are reasonable (< 40k in DASHBOARD)
- [ ] Scheduler logs show no errors

**Done! 🎉**

---

## If Something Goes Wrong

**Rollback in 1 minute:**

```bash
# 1. Stop scheduler
pm2 stop scheduler

# 2. Edit .env - comment out new IDs
# VITE_RAW_DATA_SHEETS_ID=...  <- Add # at start
# VITE_DASHBOARD_SHEETS_ID=... <- Add # at start

# 3. Restart
pm2 restart scheduler
```

---

## Commands You'll Use

```bash
# Check cell capacity
npm run cli check-capacity

# Test retention policy (dry-run)
npm run cli test-retention

# Run retention cleanup manually
npm run cli run-retention

# Get DASHBOARD cell count
npm run cli dashboard-cells

# Sync specific date
npm run cli sync-date YYYY-MM-DD -- --org NYCBS
```

---

## Daily Monitoring (1 min)

```bash
# Check logs for errors
pm2 logs scheduler --lines 100 | grep -i error

# Check cell capacity
npm run cli check-capacity
```

---

## Need More Details?

- **Full guide:** See `MIGRATION.md`
- **Implementation details:** See `IMPLEMENTATION_SUMMARY.md`
- **Troubleshooting:** See `MIGRATION.md` → Troubleshooting section

---

**Questions?** Check the logs first: `pm2 logs scheduler`
