# Slack Alerts Setup Guide

This guide explains how to set up and use the Slack alert system for daily unworked orders notifications.

## Overview

The Slack alert system sends daily reports showing:
- **Providers with unworked orders** (assigned but not completed)
- **Count of unworked orders per provider**
- **Total unworked orders for the organization**

Alerts are sent **separately for each organization** (NYCBS, CHC, MBPCC, UCBC).

---

## 1. Create Slack Incoming Webhooks

You need to create a Slack App with Incoming Webhooks for each organization's channel.

### Step-by-Step:

1. **Go to Slack API:** https://api.slack.com/apps
2. **Create a New App** or use an existing one
3. **Enable Incoming Webhooks:**
   - Click on your app
   - Go to "Incoming Webhooks" in the sidebar
   - Toggle "Activate Incoming Webhooks" to **On**
4. **Add New Webhook to Workspace:**
   - Click "Add New Webhook to Workspace"
   - Select the channel where you want alerts (e.g., `#nycbs-alerts`, `#chc-alerts`)
   - Click "Allow"
5. **Copy the Webhook URL** (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`)
6. **Repeat for each organization** (4 total webhooks)

---

## 2. Configure Environment Variables

Add the webhook URLs to your `.env` file:

```bash
# Slack Webhook URLs (for daily alerts)
SLACK_WEBHOOK_NYCBS=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_WEBHOOK_CHC=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_WEBHOOK_MBPCC=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_WEBHOOK_UCBC=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Note:** If you don't configure a webhook for an organization, alerts for that org will be skipped (with a warning in the logs).

---

## 3. Test Manually

Before setting up automated scheduling, test the alerts manually:

### Send alerts for all organizations (today):
```bash
npm run cli slack-alert
```

### Send alerts for a specific date:
```bash
npm run cli slack-alert 2026-01-03
```

### Send alert for a specific organization only:
```bash
npm run cli slack-alert -- --org chc
npm run cli slack-alert 2026-01-03 -- --org nycbs
```

---

## 4. Schedule Daily Alerts (10 PM IST)

You have **two options** for scheduling:

### Option A: Run the Scheduler Process (Recommended for local/dev)

Start the scheduler service that will run continuously:

```bash
npm run scheduler
```

This will:
- Run in the foreground
- Send alerts every day at **10:00 PM IST**
- Log all activities
- Stop with `Ctrl+C`

**For production:** Run this in the background using a process manager like:
- `pm2` (Node.js process manager)
- `systemd` (Linux service)
- Docker container with restart policy

Example with PM2:
```bash
npm install -g pm2
pm2 start npm --name "slack-alerts" -- run scheduler
pm2 save
pm2 startup  # Follow the instructions to enable on boot
```

### Option B: System Cron Job

Add a cron job to your system crontab:

```bash
crontab -e
```

Add this line (adjust the path to your project):
```
0 22 * * * cd /path/to/account-management-dashboard && npm run cli slack-alert >> /var/log/slack-alerts.log 2>&1
```

This runs at 22:00 (10 PM) system time. **Make sure your system time is set to IST** or adjust accordingly.

---

## 5. Alert Format

The Slack alert will look like this:

```
📊 NYCBS - Daily Unworked Orders Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: 2026-01-05
Total Unworked: 45 orders
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Providers with Unworked Orders:
1. John Doe: 15 unworked orders
2. Jane Smith: 12 unworked orders
3. Bob Johnson: 10 unworked orders
4. Alice Williams: 8 unworked orders

Report generated at 2026-01-05, 10:00:00 PM IST
```

If all orders are worked on:
```
✅ All assigned orders have been worked on!
```

---

## 6. Monitoring & Logs

### Check scheduler status:
```bash
# If using PM2:
pm2 status
pm2 logs slack-alerts

# If running manually:
# Check the console output where you ran `npm run scheduler`
```

### Test connection to Slack:
Send a test alert to verify your webhook URLs are configured correctly:
```bash
npm run cli slack-alert -- --org chc
```

If you see:
- `✓ Successfully sent Slack alert for CHC` → Working!
- `⚠️ No Slack webhook configured for CHC` → Check your `.env` file
- `❌ Error sending Slack alert` → Check the webhook URL is valid

---

## 7. Troubleshooting

### Alerts not sending:
1. **Check environment variables** are loaded:
   ```bash
   echo $SLACK_WEBHOOK_NYCBS
   ```
2. **Verify webhook URLs** are valid (test with curl):
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```
3. **Check Firebase authentication**:
   ```bash
   gcloud auth application-default login
   ```

### Scheduler not running at 10 PM:
1. **Verify timezone** in `src/scheduler.ts` is set to `'Asia/Kolkata'`
2. **Check system time**:
   ```bash
   date
   TZ='Asia/Kolkata' date
   ```
3. **Verify cron expression** is `'0 22 * * *'` (minute=0, hour=22)

### Wrong data in alerts:
1. **Sync data first** before sending alerts:
   ```bash
   npm run cli sync
   npm run cli slack-alert
   ```
2. **Check Firebase data** matches expectations
3. **Verify date/timezone** in queries (alerts use current day in IST)

---

## 8. Customization

### Change alert time:
Edit `src/scheduler.ts` and modify the cron schedule:
```typescript
// Current: Daily at 10 PM IST
const CRON_SCHEDULE = '0 22 * * *';

// Examples:
// 9 AM IST:  '0 9 * * *'
// 6 PM IST:  '0 18 * * *'
// Twice a day (10 AM & 10 PM): '0 10,22 * * *'
```

### Change alert format:
Edit `src/services/slackAlerts.ts` in the `formatSlackMessage()` function.

Slack Block Kit Builder: https://app.slack.com/block-kit-builder

### Add more alert types:
Modify `src/services/slackAlerts.ts` to add:
- Orders behind schedule
- Providers not logged in
- High priority unworked orders
- Custom metrics

---

## 9. Next Steps

- **Set up monitoring:** Use PM2 or systemd to ensure scheduler stays running
- **Add error notifications:** Alert on Slack if the system fails
- **Create dashboards:** Link Slack alerts to your analytics dashboard
- **Weekly summaries:** Add a weekly report with trends and insights

---

## Support

For issues or questions:
1. Check logs: `pm2 logs slack-alerts` or console output
2. Test manually: `npm run cli slack-alert`
3. Verify setup: Ensure all environment variables are set
4. Review code: `src/services/slackAlerts.ts` and `src/scheduler.ts`
