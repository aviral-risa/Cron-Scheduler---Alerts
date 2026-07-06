# CRON Scheduler Setup - Account Management Dashboard

## Overview

The Account Management Dashboard now has a comprehensive CRON scheduler that automatically syncs data at predefined intervals. All times are in **IST (Indian Standard Time)**.

## Automated Sync Schedules

### 1. Daily Metrics Sync
**Organizations**: CHC, NYCBS, MBPCC, UCBC
**Frequency**: 9 times per day
**Schedule**:

**Previous Day's Orders** (syncs yesterday's data, only if yesterday was a workday):
- 12:00 AM IST (Midnight) - Runs daily, syncs if yesterday was Mon-Fri
- 05:00 AM IST - Runs daily, syncs if yesterday was Mon-Fri

**Current Day's Orders** (syncs today's data, only if today is a workday):
- 10:00 AM IST - Runs daily, syncs if today is Mon-Fri
- 12:00 PM IST - Runs daily, syncs if today is Mon-Fri
- 02:00 PM IST - Runs daily, syncs if today is Mon-Fri
- 04:00 PM IST - Runs daily, syncs if today is Mon-Fri
- 06:00 PM IST - Runs daily, syncs if today is Mon-Fri
- 08:00 PM IST - Runs daily, syncs if today is Mon-Fri
- 10:00 PM IST - Runs daily, syncs if today is Mon-Fri

**What it does**:
- Recalculates metrics from existing raw data for all 4 organizations
- 12AM & 5AM check if **yesterday** was a workday, sync if yes
- 10AM onwards check if **today** is a workday, sync if yes
- **Smart weekend handling**: Syncs run at scheduled times, but skip if target date is a weekend

### 2. EV Metrics Sync
**Organizations**: All (NYCBS, MBPCC, CHC, CHCU, UCBC, CBC)
**Frequency**: Once per day (WEEKDAYS ONLY - Skips Saturday & Sunday)
**Schedule**: 10:00 AM IST

**What it does**: Fetches EV-specific order data from Algolia and stores to Google Sheets

### 3. Queue View Sync
**Facilities**: All (NYCBS, MBPCC, CHC, UCBC)
**Frequency**: Once per day (WEEKDAYS ONLY - Skips Saturday & Sunday)
**Schedule**: 11:00 PM IST

**What it does**: Fetches person-level queue counts from Algolia and stores to Google Sheets

### 4. Slack Alerts
**Organizations**: All
**Frequency**: Once per day
**Schedule**: 10:00 PM IST

**What it does**: Sends daily performance alerts to Slack channels

## How to Use

### Starting the Scheduler

To start the scheduler in the foreground (for testing):
```bash
npm run scheduler
```

To run the scheduler in the background:
```bash
nohup npm run scheduler > scheduler.log 2>&1 &
```

To check if the scheduler is running:
```bash
ps aux | grep scheduler
```

To stop the scheduler:
```bash
# Find the process ID
ps aux | grep scheduler

# Kill the process
kill <PID>

# Or use Ctrl+C if running in foreground
```

### Viewing Scheduler Logs

If running in background with nohup:
```bash
tail -f scheduler.log
```

## Manual CLI Commands

You can also run sync operations manually using the CLI:

### Daily Metrics Sync
```bash
# Sync for today (all orgs)
npm run cli sync

# Sync for specific date (all orgs)
npm run cli sync-date 2026-01-18

# Sync for specific org only
npm run cli sync-date 2026-01-18 -- --org chc

# Recalculate metrics only (no Firebase query)
npm run cli sync-date 2026-01-18 -- --metrics-only
```

### EV Metrics Sync
```bash
# Sync EV metrics for today (all orgs)
npm run cli sync-ev-metrics

# Sync for specific date
npm run cli sync-ev-metrics 2026-01-18

# Sync for specific org only
npm run cli sync-ev-metrics -- --org NYCBS
```

### Queue View Sync
```bash
# Sync queue data for all facilities
npm run cli sync-queue
```

### Slack Alerts
```bash
# Send alerts for today
npm run cli slack-alert

# Send alerts for specific date
npm run cli slack-alert 2026-01-18

# Send alert for specific org only
npm run cli slack-alert -- --org chc
```

## Production Deployment

### Using PM2 (Recommended)

PM2 is a production process manager for Node.js applications:

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the scheduler with PM2:
```bash
pm2 start npm --name "account-dashboard-scheduler" -- run scheduler
```

3. Save the PM2 process list:
```bash
pm2 save
```

4. Set PM2 to start on system reboot:
```bash
pm2 startup
```

5. Monitor the scheduler:
```bash
pm2 logs account-dashboard-scheduler
pm2 status
```

6. Stop/restart the scheduler:
```bash
pm2 stop account-dashboard-scheduler
pm2 restart account-dashboard-scheduler
```

### Using systemd (Linux)

Create a systemd service file `/etc/systemd/system/account-dashboard-scheduler.service`:

```ini
[Unit]
Description=Account Management Dashboard Scheduler
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/account-management-dashboard
ExecStart=/usr/bin/npm run scheduler
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=account-dashboard-scheduler

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable account-dashboard-scheduler
sudo systemctl start account-dashboard-scheduler
sudo systemctl status account-dashboard-scheduler
```

## Important Notes

### Prerequisites
- **API Server**: The backend API server must be running on `http://localhost:3001` for queue sync to work
- **Environment Variables**: Ensure `.env` file is properly configured with all required credentials
- **Google Sheets**: Sheets must be initialized before first sync (`npm run cli init`)

### Time Zone
All CRON schedules use **Asia/Kolkata** timezone (IST). The scheduler automatically handles timezone conversions.

### Error Handling
- Each sync job runs independently
- If one organization fails, others will continue
- Errors are logged to console/log file
- Failed syncs can be retried manually using CLI commands

### Weekend Behavior - IMPORTANT

**Smart Weekend Handling**: The scheduler checks if the target date is a workday before syncing.

#### Examples:

**Friday, January 17, 2026** (Workday):
- All syncs run normally throughout the day for Friday's orders

**Saturday, January 18, 2026** (Weekend):
- ✅ **12:00 AM**: Runs and syncs **Friday Jan 17's** orders (yesterday was a workday)
- ✅ **05:00 AM**: Runs and syncs **Friday Jan 17's** orders (yesterday was a workday)
- ❌ **10:00 AM - 10:00 PM**: Runs but skips (today is a weekend, no Saturday orders)

**Sunday, January 19, 2026** (Weekend):
- ❌ **12:00 AM**: Runs but skips (yesterday Saturday was a weekend, no orders to sync)
- ❌ **05:00 AM**: Runs but skips (yesterday Saturday was a weekend, no orders to sync)
- ❌ **10:00 AM - 10:00 PM**: Runs but skips (today is a weekend, no Sunday orders)

**Monday, January 20, 2026** (Workday):
- ❌ **12:00 AM**: Runs but skips (yesterday Sunday was a weekend, no orders to sync)
- ❌ **05:00 AM**: Runs but skips (yesterday Sunday was a weekend, no orders to sync)
- ✅ **10:00 AM**: Runs and syncs **Monday Jan 20's** orders (FIRST SYNC of the week!)
- ✅ **12:00 PM - 10:00 PM**: All syncs run normally for Monday's orders

### Starting Tomorrow
The scheduler is now running. Since today is **Sunday, January 18, 2026**, tonight at 12:00 AM (which is technically Monday) it will check if Sunday was a workday (no) and skip the sync.

**First actual sync**: Monday, January 20, 2026 at 10:00 AM IST (syncs Monday's orders)

## Monitoring & Troubleshooting

### Check Current Status
```bash
# View scheduler output
tail -f scheduler.log

# Check if scheduler process is running
ps aux | grep scheduler

# View PM2 logs (if using PM2)
pm2 logs account-dashboard-scheduler
```

### Common Issues

**Issue**: Queue sync fails with "API server not running"
**Solution**: Start the API server first: `npm run api`

**Issue**: EV metrics sync fails with authentication error
**Solution**: Check `.env` file has valid `ALGOLIA_AUTH_EMAIL` and `ALGOLIA_AUTH_PASSWORD`

**Issue**: Daily metrics sync shows "No data found"
**Solution**: Ensure raw data was collected first using `npm run cli sync-date <date> -- --raw-only`

### Manual Testing
To test if a sync will work before waiting for the scheduled time:
```bash
# Test daily metrics sync
npm run cli sync-date 2026-01-18 -- --metrics-only

# Test EV metrics sync
npm run cli sync-ev-metrics

# Test queue sync (requires API server running)
npm run cli sync-queue
```

## Support

For issues or questions, check the main README.md or contact the development team.
