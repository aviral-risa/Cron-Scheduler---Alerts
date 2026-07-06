# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

PA Orders Analytics Dashboard - real-time operational monitoring for Prior Authorization order processing across healthcare organizations (NYCBS, CHC, MBPCC, UCBC, SunState). Fetches order data from Algolia API (with Firestore fallback), calculates metrics, stores to Google Sheets, and displays via React dashboard.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Data Sources**: Algolia Search API (primary), Firestore (fallback)
- **Storage**: Google Sheets (data warehouse with 5 sheets)
- **Notifications**: Slack webhooks
- **Runtime**: Node.js 18+, tsx for TypeScript CLI execution

## Build & Run Commands

```bash
# Development
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # TypeScript check + Vite production build
npm run lint             # ESLint

# CLI Tool
npm run cli init         # Initialize Google Sheets with headers
npm run cli sync         # Sync today's data (raw + metrics)
npm run cli sync-date 2026-01-10                    # Sync specific date
npm run cli sync-date 2026-01-10 -- --force         # Force sync (holidays/weekends)
npm run cli sync-date 2026-01-10 -- --org chc       # Single org: nycbs, chc, mbpcc, ucbc
npm run cli sync-date 2026-01-10 -- --raw-only      # Raw data only (no metrics)
npm run cli sync-date 2026-01-10 -- --metrics-only  # Recalculate metrics from sheets

# Scheduler & Alerts
npm run scheduler        # Run cron scheduler (syncs at 10AM-10PM IST)
npm run alert:list       # List all configured alerts
npm run alert:<type>     # Run specific alert (queue, denial, performance, etc.)

# Firebase Functions
npm run build:functions   # Build Firebase functions
npm run deploy:functions  # Deploy to Firebase
```

## Architecture

**Staged Pipeline (Bronze → Silver → Gold)**:
```
Algolia/Firestore → orders_raw_hourly → Metrics Calculation → Dashboard
       (Layer 1)          (Bronze)           (Silver)           (Gold)
```

**Key Services** (`src/services/`):
- `data-source.ts` - Abstraction layer routing to Algolia or Firestore based on `ORDER_DATA_SOURCE` env var
- `algolia/` - Auth token management, data fetching with pagination, transform to OrderSnapshot
- `sync.ts` - Pipeline orchestration: `syncRawData()` (Layer 1), `calculateMetricsFromSnapshots()` (Layer 2)
- `sheets-dual.ts` - Google Sheets API for dual-spreadsheet architecture
- `slackAlerts.ts` - Slack webhook notifications

**Configuration** (`src/config/`):
- `organizations.ts` - Facility IDs, team sizes, Slack channels
- `data-source.config.ts` - Data source selection (Algolia vs Firestore)

## Core Data Types

All types defined in `src/types/orders.ts`:
- `OrderSnapshot` - Transformed order with IST timestamps
- `OrgMetrics` - Organization-level aggregated metrics
- `PersonMetrics` - Individual provider performance
- `DailySummary` - Daily status breakdown
- `UniqueOrderStatus` - Full 29-field order tracking
- `BusinessMetricsDaily` - Business-level aggregations

## Key Conventions

1. **Timestamps**: All timestamps use IST (Asia/Kolkata), formatted as `"2026-01-04 14:16:14"`
2. **Environment Variables**: Use `VITE_` prefix for frontend-accessible vars
3. **Path Aliases**: `@/*` maps to `./src/*` (configured in tsconfig.app.json)
4. **Organizations**: Use facility IDs (e.g., `HhwIHO4npKhrxyylkC33` for NYCBS), CLI accepts lowercase names (`nycbs`, `chc`, `mbpcc`, `ucbc`)

## Working with CLI

The CLI (`src/cli.ts`) is the primary interface for data operations. Commands use the pattern:
```bash
npm run cli <command> [date] -- [flags]
```

Double dash `--` is required before flags when using npm run.

## Google Sheets Structure

Two spreadsheets managed:
1. **Dashboard Spreadsheet** (`VITE_GOOGLE_SHEETS_ID`): orders_raw_hourly, org_hourly_metrics, person_hourly_performance, daily_summary, config_working_days
2. **Queue Spreadsheet** (`VITE_GOOGLE_SHEETS_QUEUE_ID`): queue_daily_log, queue_hourly

## Alert System

Alerts in `src/alerts/` send Slack messages via webhooks. Each alert type has its own script:
- `queue-view-alert.ts` - Queue status
- `denial-tracking-alert.ts` - Denial tracking
- `performance-alert.ts` - Performance metrics
- `open-orders-summary-alert.ts` - Open orders summary

Alert registry in `src/alerts/config/alert-registry.ts`.

## Environment Variables

Required in `.env`:
- Firebase: `VITE_FIREBASE_*` (project config)
- Google Sheets: `VITE_GOOGLE_SHEETS_ID`, `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `VITE_GOOGLE_PRIVATE_KEY`
- Algolia: `ALGOLIA_AUTH_URL`, `ALGOLIA_SEARCH_URL`, `ALGOLIA_USERNAME`, `ALGOLIA_PASSWORD`
- Data Source: `ORDER_DATA_SOURCE=algolia` (or `firestore`), `ENABLE_FIRESTORE_FALLBACK=true`
