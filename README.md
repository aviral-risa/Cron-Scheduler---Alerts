# PA Orders Analytics Dashboard

> Real-time operational monitoring system for Prior Authorization order processing teams

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Data Schemas](#data-schemas)
- [Services](#services)
- [CLI Commands](#cli-commands)
- [Metrics Reference](#metrics-reference)
- [Google Sheets Schema](#google-sheets-schema)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What It Does

The PA Orders Analytics Dashboard tracks Prior Authorization order processing in real-time across multiple healthcare organizations. It:

- **Collects** order data from Algolia Search API (with Firestore fallback)
- **Calculates** performance metrics at organization and individual provider levels
- **Stores** historical data in Google Sheets for trend analysis
- **Displays** real-time metrics in a React dashboard
- **Tracks pace** compared to 7-day working averages
- **Identifies** underperformance with status indicators

### Tech Stack

- **Frontend:** React 18.3.1 + TypeScript + Vite
- **Data Source:** Algolia Search API (primary) with Firestore fallback
- **Storage:** Google Sheets API (historical data warehouse)
- **Authentication:** Google Cloud Service Account (from .env) + Algolia Bearer Token
- **Charts:** Recharts
- **CLI:** tsx (TypeScript execution)

### Organizations

| Organization | Staff | Daily Orders | Facility ID |
|--------------|-------|--------------|-------------|
| NYCBS | 22 | ~1,200 | HhwIHO4npKhrxyylkC33 |
| CHC | 8 | ~600 | 4BlQ4SsqAVTDgFKApKZr |
| MBPCC | 5 | ~400 | 3GKbZtgpPru1vJGCkxwR |
| UCBC | 4 | ~300 | W14MolgUu7OYvX4CFQJn |
| **Total** | **39** | **~2,500** | |

---

## Architecture

### Staged Analytics Pipeline

The system follows a **data warehouse architecture** with clear separation between data collection and metric calculation:

```
┌─────────────────────────────────────────────────────────┐
│ LAYER 1: Raw Data Collection (Bronze)                  │
│ Algolia API (+ Firestore fallback) → orders_raw_hourly │
│ • Query facility-specific data                          │
│ • Transform to OrderSnapshot format                     │
│ • Store immutable raw snapshots (IST timezone)          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ LAYER 2: Metrics Calculation (Silver)                  │
│ orders_raw_hourly → Aggregated Metrics                  │
│ • Read latest snapshots per order                       │
│ • Calculate org-level metrics                           │
│ • Calculate person-level metrics                        │
│ • Calculate daily status summaries                      │
│ • Write to metric sheets                                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ LAYER 3: Dashboard Views (Gold)                        │
│ Google Sheets (5 sheets)                                │
│ ├── orders_raw_hourly (raw data)                        │
│ ├── org_hourly_metrics (aggregated)                     │
│ ├── person_hourly_performance (aggregated)              │
│ ├── daily_summary (status breakdown)                    │
│ └── config_working_days (configuration)                 │
└─────────────────────────────────────────────────────────┘
                          ↓
              [React Dashboard] Displays metrics & charts
```

### Key Benefits

✅ **Recalculate metrics anytime** - No Firebase queries needed
✅ **Change metric definitions** - Just run `--metrics-only` to update
✅ **Prepare for future schemas** - RPA events, documents, notes can follow same pattern
✅ **Cost optimization** - Avoid unnecessary Firebase reads
✅ **Dashboard-ready** - Query optimized metric sheets efficiently

### Directory Structure

```
account-management-dashboard/
├── src/
│   ├── cli.ts                       # CLI tool entry point
│   ├── services/
│   │   ├── data-source.ts           # Data source abstraction (NEW)
│   │   ├── algolia/                 # Algolia integration (NEW)
│   │   │   ├── auth.service.ts     # Bearer token management
│   │   │   ├── fetch.service.ts    # Data fetching
│   │   │   └── transform.service.ts # Algolia → OrderSnapshot
│   │   ├── firebaseGcloud.ts        # Firebase queries (fallback)
│   │   ├── sheets.ts                # Google Sheets API
│   │   └── sync.ts                  # Sync orchestration & metrics
│   ├── types/
│   │   └── orders.ts                # TypeScript interfaces
│   ├── config/
│   │   ├── data-source.config.ts    # Data source config (NEW)
│   │   └── organizations.ts         # Org configuration
│   ├── App.tsx                      # React dashboard UI
│   └── main.tsx                     # React entry point
├── algolia_integration_test/        # Test implementation (NEW)
├── backfill-7-days.sh               # Batch backfill script
├── backfill-remaining.sh            # Partial backfill script
├── package.json                     # Dependencies
├── .env                             # Environment variables
└── README.md                        # This file
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Firebase project with Firestore
- Google service account with Sheets and Firestore access

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
# Firebase
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIRESTORE_COLLECTION=medical_pa_orders

# Google Sheets & Firestore (Service Account)
VITE_GOOGLE_SHEETS_ID=your_sheets_id
VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL=your_sa@project.iam.gserviceaccount.com
VITE_GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Algolia API
ALGOLIA_AUTH_URL=https://authentication.risalabs.ai/api/v1/user-auth/token
ALGOLIA_SEARCH_URL=https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search
ALGOLIA_USERNAME=your_username
ALGOLIA_PASSWORD=your_password
```

**Note:** All authentication uses the service account credentials from `.env`. No gcloud CLI setup required.

### 3. Initialize Google Sheets

```bash
npm run cli init
```

This creates 5 sheets with proper headers:
- `orders_raw_hourly` - Raw order snapshots
- `org_hourly_metrics` - Organization metrics
- `person_hourly_performance` - Provider metrics
- `daily_summary` - Daily status breakdown
- `config_working_days` - Working day configuration

### 4. Sync Data

```bash
# Sync today's data
npm run cli sync

# Sync specific date
npm run cli sync-date 2026-01-03

# Backfill last 7 working days
./backfill-7-days.sh
```

### 6. Run Dashboard

```bash
npm run dev
```

Open http://localhost:5173

---

## Data Schemas

### TypeScript Interfaces

#### FirebaseOrder

Raw order document from Firestore.

```typescript
interface FirebaseOrder {
  id: string;
  assigned_to: {
    facility_id: string;      // Organization identifier
    provider_id: string;       // Staff ID
    provider_name: string;     // Staff name or "unassigned"
  };
  status: {
    master_auth_status: string;  // Auth status
  };
  timestamps: {
    created_at: string;        // ISO timestamp
    assigned_at: string | null;
    date_of_work: string | null;
  };
}
```

#### OrderSnapshot

Transformed for hourly tracking (all timestamps in IST).

```typescript
interface OrderSnapshot {
  snapshot_timestamp: string;   // When snapshot taken (IST: "2026-01-04 14:16:14")
  snapshot_hour_ist: string;    // Hour when sync ran (IST: "0"-"23")
  order_id: string;
  facility_id: string;
  provider_name: string | null;
  master_auth_status: string;   // Order authorization status
  created_at: string;           // Full timestamp (IST: "2026-01-03 10:30:45")
  created_at_date: string;      // Date of order creation (IST: "2026-01-03")
  assigned_at: string | null;
  date_of_work: string | null;
  is_assigned: boolean;         // Has provider (not "unassigned")
  is_worked: boolean;           // Has date_of_work
}
```

**Important:** `snapshot_timestamp` = when sync runs, `created_at_date` = date of orders being synced

#### OrgMetrics

Organization-level aggregated metrics.

```typescript
interface OrgMetrics {
  snapshot_timestamp: string;            // When sync ran (IST)
  snapshot_hour_ist: string;             // Hour when sync ran (IST: "0"-"23")
  created_at_date: string;               // Date of orders being synced (IST)
  facility_id: string;
  orders_loaded_today: number;           // Total orders created
  orders_assigned: number;               // Assigned to providers
  orders_worked: number;                 // Work completed
  orders_not_worked_assigned: number;    // Backlog
  work_rate_pct: number;                 // Completion %
  avg_worked_last_7_working_days: number;  // Historical avg
  pace_vs_avg: number;                   // Current - avg
  pace_status: 'AHEAD' | 'ON_PACE' | 'BEHIND';
  projected_eod_worked: number;          // Projected EOD
}
```

#### PersonMetrics

Individual provider performance.

```typescript
interface PersonMetrics {
  snapshot_timestamp: string;            // When sync ran (IST)
  snapshot_hour_ist: string;             // Hour when sync ran (IST: "0"-"23")
  created_at_date: string;               // Date of orders being synced (IST)
  facility_id: string;
  provider_name: string;
  assigned_count: number;
  worked_count: number;
  not_worked_count: number;
  avg_worked_last_7_working_days: number;
  person_pace_vs_avg: number;
  person_pace_status: 'AHEAD' | 'ON_PACE' | 'BEHIND';
}
```

#### DailySummary (NEW)

Daily order status breakdown - tracks completion by authorization status.

```typescript
interface DailySummary {
  created_at_date: string;               // Date of orders (IST: "2026-01-03")
  facility_id: string;                   // Organization ID
  total_orders: number;                  // Total count of orders
  orders_assigned: number;               // Assigned to providers
  orders_completed: number;              // Work completed
  // Status breakdown (ONLY for completed orders)
  status_auth_by_risa: number;          // Authorized by RISA
  status_auth_on_file: number;          // Auth on file
  status_no_auth_required: number;      // No auth required
  status_denial_by_risa: number;        // Denied by RISA
  status_denial_after_query: number;    // Denied after query
  status_existing_denial: number;       // Existing denial
  status_query: number;                 // In query
  status_pending: number;               // Pending
  status_hold: number;                  // On hold
  status_auth_required: number;         // Auth required
  status_other: number;                 // Other statuses
  last_updated_timestamp: string;       // When calculated (IST)
}
```

**Important:** Status counts are ONLY for completed orders (`is_worked = true`), so `orders_completed = sum of all status counts`

---

## Services

### data-source.ts (NEW - Jan 2026)

**Purpose:** Unified abstraction layer for fetching orders from Algolia or Firestore.

**Key Functions:**

#### `fetchOrdersByDate(date: Date, facilityId: string): Promise<OrderSnapshot[]>`

Fetches orders using the configured data source (Algolia or Firestore).

- **Configuration:** Reads `ORDER_DATA_SOURCE` from environment
- **Primary Path:** Algolia API (fast, sub-2-second queries)
- **Fallback Path:** Firestore (if Algolia fails and `ENABLE_FIRESTORE_FALLBACK=true`)
- **Returns:** Already transformed OrderSnapshot[] (no additional transformation needed)

**Flow:**
```typescript
1. Check config: useAlgolia() or useFirestore()
2. If Algolia:
   a. Try Algolia fetch + transform
   b. On error, fallback to Firestore if enabled
3. If Firestore:
   a. Fetch from Firestore + transform
4. Return OrderSnapshot[]
```

#### `logCurrentDataSource(): void`

Logs the current data source configuration at startup.

### algolia/ (NEW - Jan 2026)

**Purpose:** Algolia API integration services.

#### `algolia/auth.service.ts`

**Bearer token management with auto-refresh:**
- Fetches token from authentication endpoint
- Caches token with 40-minute expiration (refreshes 5 minutes early)
- Retry logic with exponential backoff

```typescript
await algoliaAuthService.getAuthToken(); // Returns cached or fresh token
```

#### `algolia/fetch.service.ts`

**Data fetching with pagination:**
- Fetches orders by facility + date range
- Handles pagination (2000 hits per page)
- Parallel fetch for multiple pages (batches of 5)
- Retry logic with exponential backoff

```typescript
await algoliaFetchService.fetchOrdersByDate(facilityId, '2026-01-10');
```

#### `algolia/transform.service.ts`

**Algolia → OrderSnapshot transformation:**
- Maps Algolia fields to OrderSnapshot interface
- Converts UTC timestamps to IST
- Derives `is_assigned` and `is_worked` fields
- Maintains backward compatibility

```typescript
algoliaTransformService.transformOrders(algoliaOrders);
```

### firebaseGcloud.ts

**Purpose:** Alternative Firebase implementation using Application Default Credentials (gcloud auth).

**Status:** Available but not currently used. The system uses `firebase.ts` with service account credentials from `.env` instead.

**Note:** This file was created as an alternative authentication method for environments where gcloud CLI is set up (e.g., Cloud Functions, GCE instances). For local development, the service account credential approach in `firebase.ts` is more reliable and doesn't require gcloud CLI installation

### sheets.ts

**Purpose:** Google Sheets API integration for data warehouse layers.

**Key Functions:**

#### `appendOrderSnapshots(snapshots: OrderSnapshot[]): Promise<void>`

Appends to `orders_raw_hourly` sheet (Bronze layer - raw data).

#### `appendOrgMetrics(metrics: OrgMetrics[]): Promise<void>`

Appends to `org_hourly_metrics` sheet (Silver layer - aggregated).

#### `appendPersonMetrics(metrics: PersonMetrics[]): Promise<void>`

Appends to `person_hourly_performance` sheet (Silver layer - aggregated).

#### `appendOrUpdateDailySummary(summaries: DailySummary[]): Promise<void>` (NEW)

**UPSERT logic** for `daily_summary` sheet (Silver layer - aggregated).

- Checks if row exists for `date + facility_id` combination
- **Updates** existing row if found (prevents duplicates)
- **Appends** new row if not found
- **Why UPSERT:** Since we update after every hourly sync throughout the day

#### `getLatestOrderSnapshots(date: string, facilityId?: string): Promise<OrderSnapshot[]>` (NEW)

**Reads from `orders_raw_hourly` sheet** to get latest snapshots.

- Filters by `created_at_date` and optional `facilityId`
- Groups by `order_id`, keeps latest `snapshot_timestamp` per order
- **Enables metrics recalculation** without Firebase queries
- **Key for staged pipeline:** Layer 2 can read from Layer 1

#### `getWorkingDayConfig(date: string): Promise<WorkingDayConfig | null>`

Reads working day override from `config_working_days` sheet.

#### `initializeSheets(): Promise<void>`

Creates all 5 sheets with headers. Run once during setup.
- Creates sheet tabs if they don't exist
- Sets header rows with proper column names

### sync.ts

**Purpose:** Staged pipeline orchestration and metrics calculation.

**Key Functions (Staged Pipeline Architecture):**

#### **LAYER 1: Raw Data Collection**

##### `syncRawData(date: Date, facilityId: string, facilityName: string): Promise<OrderSnapshot[]>`

Collects raw data from configured data source (Algolia or Firestore) and writes to `orders_raw_hourly` sheet.

**Steps:**
1. Fetch orders from data source (uses `fetchOrdersByDate()` from data-source.ts)
2. Data is already transformed to OrderSnapshot format
3. Write to orders_raw_hourly sheet
4. Return snapshots for in-memory use

**Note:** Now uses data source abstraction - automatically routes to Algolia or Firestore based on configuration.

##### `syncOrderDataRawOnly(date: Date, force: boolean, facilityId?: string): Promise<void>` (NEW)

Full workflow for raw-only sync (no metrics calculation).

```bash
npm run cli sync-date 2026-01-03 -- --raw-only
```

#### **LAYER 2: Metrics Calculation**

##### `calculateMetricsFromSnapshots(snapshots, facilityId, facilityName, ordersDate): Promise<{...}>`

Calculates metrics from **in-memory** snapshots.

- Calculate org metrics
- Calculate person metrics
- Calculate daily summary
- Write all to respective sheets

##### `calculateMetricsFromSheets(date: Date, facilityId: string, facilityName: string): Promise<{...}>` (NEW)

**Reads from `orders_raw_hourly` sheet** and calculates metrics (**NO Firebase query**).

**Steps:**
1. Call `getLatestOrderSnapshots()` to read from sheet
2. Pass snapshots to `calculateMetricsFromSnapshots()`
3. Write metrics to sheets

**Use Case:** Recalculate metrics after changing logic, no Firebase reads needed!

```bash
npm run cli sync-date 2026-01-03 -- --metrics-only
```

##### `syncOrderDataMetricsOnly(date: Date, force: boolean, facilityId?: string): Promise<void>` (NEW)

Full workflow for metrics-only calculation from sheets.

#### **FULL SYNC (Backward Compatible)**

##### `syncOrderData(date: Date, force: boolean, facilityId?: string): Promise<void>`

Runs both layers: raw data collection + metrics calculation.

**Steps:**
1. Check if working day (skip unless `force = true`)
2. Call `syncRawData()` - Layer 1
3. Call `calculateMetricsFromSnapshots()` - Layer 2
4. Parallelizes across all organizations

```bash
npm run cli sync-date 2026-01-03  # Default, does both layers
```

#### **METRIC CALCULATION FUNCTIONS**

##### `calculateOrgMetrics(snapshots, facilityId, snapshotTime, ordersDate, historicalAvg): OrgMetrics`

- Counts orders (loaded, assigned, worked, not_worked)
- Calculates work_rate_pct = `(worked / loaded) * 100`
- Compares to historical average
- Projects end-of-day based on current hour (11 AM - 8 PM work hours)

##### `calculatePersonMetrics(snapshots, facilityId, snapshotTime, ordersDate, historicalAvgByPerson): PersonMetrics[]`

- Groups by provider_name
- Counts assigned, worked, not_worked per person
- Compares to personal historical average

##### `calculateDailySummary(snapshots, facilityId, ordersDate): DailySummary` (NEW)

- Counts total, assigned, completed orders
- **Filters to completed orders only** (`is_worked = true`)
- Counts by `master_auth_status` for completed orders
- **Validation:** `orders_completed = sum of all status counts`

#### **UTILITY FUNCTIONS**

##### `isWorkingDay(date: Date): Promise<boolean>`

1. Checks `config_working_days` sheet (overrides)
2. Falls back to weekend check (Sat/Sun = non-working)
3. Defaults to working day

---

## CLI Commands

### Initialize Sheets

```bash
npm run cli init
```

Creates 5 Google Sheets with headers. **Run once during setup.**

### Sync Today

```bash
npm run cli sync
```

Syncs data for current date (both layers: raw + metrics). Skips if non-working day.

### Sync Specific Date (Full Pipeline)

```bash
npm run cli sync-date <YYYY-MM-DD> [options]
```

**Options:**
- `--force` - Force sync even on non-working days
- `--org <org>` - Sync only specific organization (nycbs, chc, mbpcc, ucbc)
- `--raw-only` - **Only** collect raw data (no metrics calculation)
- `--metrics-only` - **Only** calculate metrics from existing raw data (no Firebase query)

**Examples:**

```bash
# Full sync (raw data + metrics)
npm run cli sync-date 2026-01-03

# Force holiday sync
npm run cli sync-date 2025-12-25 -- --force

# Sync single organization
npm run cli sync-date 2026-01-03 -- --org chc

# RAW DATA ONLY - Collect from Firebase, skip metrics
npm run cli sync-date 2026-01-03 -- --raw-only

# METRICS ONLY - Recalculate from sheets, no Firebase query
npm run cli sync-date 2026-01-03 -- --metrics-only

# Recalculate metrics for specific org
npm run cli sync-date 2026-01-03 -- --metrics-only --org chc

# Combine flags
npm run cli sync-date 2026-01-03 -- --force --org mbpcc
```

### Backfill Historical Data

```bash
npm run cli backfill
```

Backfills last 5 working days automatically.

**Or use shell scripts for custom ranges:**
```bash
./backfill-7-days.sh        # Last 7 working days
./backfill-remaining.sh     # Custom date range
```

### When to Use Each Mode

| Command | Use Case | Firebase Query? | Updates Metrics? |
|---------|----------|----------------|------------------|
| `sync-date` | Regular hourly sync | ✅ Yes | ✅ Yes |
| `--raw-only` | Collect data, calculate metrics later | ✅ Yes | ❌ No |
| `--metrics-only` | Changed metric logic, recalculate | ❌ No | ✅ Yes |
| `--org <org>` | Test single org, save Firebase reads | ✅ Yes (1 facility) | ✅ Yes |

---

## Metrics Reference

### Organization-Level Metrics

#### Orders Loaded Today
**Definition:** Total orders with `created_at` on target date
**Includes:** All orders (assigned and unassigned)

#### Orders Assigned
**Definition:** Count where `is_assigned = true`
**Criteria:** `provider_name` exists and ≠ "unassigned"

#### Orders Worked
**Definition:** Count where `is_worked = true`
**Criteria:** `date_of_work` timestamp exists

#### Orders Not Worked (Assigned)
**Formula:** `orders_assigned - orders_worked`
**Meaning:** Backlog of assigned but incomplete orders

#### Work Rate Percentage
**Formula:** `(orders_worked / orders_loaded_today) * 100`
**Meaning:** Overall completion rate

#### Average Worked (Last 7 Working Days)
**Definition:** Historical baseline for pace comparison
**Status:** Currently placeholder (0) - marked as TODO

#### Pace vs Average
**Formula:** `orders_worked - avg_worked_last_7_working_days`
**Interpretation:**
- Positive = ahead of pace
- Negative = behind pace

#### Pace Status
**Thresholds:**
- `AHEAD`: pace_vs_avg > +5
- `BEHIND`: pace_vs_avg < -5
- `ON_PACE`: between -5 and +5

#### Projected EOD Worked
**Work Hours:** 11 AM - 8 PM (9 hours total)
**Formula:** `(orders_worked / hours_worked_so_far) * 9`
**Example:** At 2 PM (3 hours), if 300 worked: `(300/3) * 9 = 900 projected`

### Person-Level Metrics

#### Assigned Count
Number of orders assigned to specific provider.

#### Worked Count
Number of orders worked by specific provider.

#### Not Worked Count
**Formula:** `assigned_count - worked_count`

#### Person Pace vs Average
**Formula:** `worked_count - personal_avg_worked_last_7_days`

#### Person Pace Status
**Thresholds:**
- `AHEAD`: pace > +2
- `BEHIND`: pace < -2
- `ON_PACE`: between -2 and +2

---

## Google Sheets Schema

### Sheet 1: orders_raw_hourly

**Purpose:** Raw order snapshots (one row per order per sync)

| Column | Type | Description |
|--------|------|-------------|
| snapshot_timestamp | String (ISO) | When snapshot was taken |
| snapshot_date | String | YYYY-MM-DD |
| snapshot_hour | Number | Hour (0-23) |
| order_id | String | Firestore document ID |
| facility_id | String | Organization identifier |
| provider_name | String | Provider name (or empty) |
| master_auth_status | String | Authorization status |
| created_at | String (ISO) | Order creation time |
| assigned_at | String (ISO) | Assignment time |
| date_of_work | String (ISO) | Work completion time |
| is_assigned | Boolean | TRUE/FALSE |
| is_worked | Boolean | TRUE/FALSE |

### Sheet 2: org_hourly_metrics

**Purpose:** Organization-level aggregated metrics

| Column | Type | Description |
|--------|------|-------------|
| snapshot_timestamp | String (ISO) | Snapshot time |
| facility_id | String | Organization ID |
| orders_loaded_today | Number | Total orders created |
| orders_assigned | Number | Assigned to providers |
| orders_worked | Number | Work completed |
| orders_not_worked_assigned | Number | Backlog |
| work_rate_pct | Number | Completion % |
| avg_worked_last_7_working_days | Number | Historical average |
| pace_vs_avg | Number | Current - average |
| pace_status | String | AHEAD/ON_PACE/BEHIND |
| projected_eod_worked | Number | Projected end-of-day |

### Sheet 3: person_hourly_performance

**Purpose:** Individual provider/staff performance

| Column | Type | Description |
|--------|------|-------------|
| snapshot_timestamp | String (ISO) | Snapshot time |
| facility_id | String | Organization ID |
| provider_name | String | Provider name |
| assigned_count | Number | Orders assigned |
| worked_count | Number | Orders worked |
| not_worked_count | Number | Not worked |
| avg_worked_last_7_working_days | Number | Personal average |
| person_pace_vs_avg | Number | Personal pace delta |
| person_pace_status | String | AHEAD/ON_PACE/BEHIND |

### Sheet 4: config_working_days

**Purpose:** Working day configuration (holidays, overrides)

| Column | Type | Description |
|--------|------|-------------|
| date | String | YYYY-MM-DD |
| is_working_day | Boolean | TRUE/FALSE |
| day_type | String | "Holiday", "Weekend", etc. |
| notes | String | Description |

**Example:**
```
| date       | is_working_day | day_type | notes          |
|------------|----------------|----------|----------------|
| 2026-01-01 | FALSE          | Holiday  | New Year's Day |
| 2025-12-25 | FALSE          | Holiday  | Christmas      |
```

---

## Configuration

### Data Source Configuration (NEW - Jan 2026)

The system now supports **configurable data sources** for order extraction. You can switch between Algolia (fast, sub-2-second queries) and Firestore (traditional, slower) using environment variables.

#### Why Algolia?

**Performance Improvement:** 16x faster
- Algolia: 6-12 seconds per facility
- Firestore: 2-5 minutes per facility

**Data Completeness:** Algolia is the source of truth for indexed order data and provides more complete results.

#### Configuration Variables

Add these to your `.env` file:

```bash
# Data Source Configuration
ORDER_DATA_SOURCE=algolia              # 'algolia' or 'firestore'
ENABLE_FIRESTORE_FALLBACK=true        # Falls back to Firestore if Algolia fails
MAX_RETRY_ATTEMPTS=3                   # Retry count for failed requests
ALGOLIA_TIMEOUT=30000                  # Request timeout in milliseconds

# Algolia API Configuration
ALGOLIA_AUTH_URL=https://authentication.risalabs.ai/api/v1/user-auth/token
ALGOLIA_SEARCH_URL=https://apis.risalabs.ai/pa-order-creation/medical/utility/algolia-search
ALGOLIA_USERNAME=risa_front_end_user
ALGOLIA_PASSWORD=your_password_here
```

#### Data Source Options

| Setting | Description | Use Case |
|---------|-------------|----------|
| `ORDER_DATA_SOURCE=algolia` | Primary: Use Algolia API | **Recommended** - Fast queries, current data |
| `ORDER_DATA_SOURCE=firestore` | Primary: Use Firestore | Fallback or testing |
| `ENABLE_FIRESTORE_FALLBACK=true` | Auto-switch to Firestore on Algolia errors | **Recommended** - Reliability |
| `ENABLE_FIRESTORE_FALLBACK=false` | Fail immediately if Algolia errors | Development/debugging |

#### Migration Notes (January 2026)

**What Changed:**
- ✅ Added Algolia as primary data source (16x faster than Firestore)
- ✅ Created data source abstraction layer (`src/services/data-source.ts`)
- ✅ Maintained backward compatibility - all existing functionality preserved
- ✅ Added configurable fallback mechanism for reliability

**What Stayed the Same:**
- ✅ OrderSnapshot interface unchanged
- ✅ All metrics calculations unchanged
- ✅ Google Sheets schema unchanged
- ✅ CLI commands work identically
- ✅ Dashboard UI unchanged

**Validation Results:**
- Field match rate: 99.81% (tested on Jan 10, 2026)
- Algolia had 99 MORE orders than Firestore (3,381 vs 3,282)
- All 12 critical fields present and backward compatible

#### Implementation Details

**New Files:**
- `src/config/data-source.config.ts` - Configuration management
- `src/services/data-source.ts` - Abstraction layer
- `src/services/algolia/auth.service.ts` - Bearer token management
- `src/services/algolia/fetch.service.ts` - Data fetching with pagination
- `src/services/algolia/transform.service.ts` - Algolia → OrderSnapshot transformation

**Modified Files:**
- `src/services/sync.ts` - Now uses data source abstraction instead of direct Firestore calls

**How It Works:**
1. System reads `ORDER_DATA_SOURCE` from environment
2. Data source abstraction layer routes to Algolia or Firestore
3. If Algolia fails and `ENABLE_FIRESTORE_FALLBACK=true`, automatically switches to Firestore
4. Data is transformed to OrderSnapshot format (same interface for both sources)
5. Rest of pipeline (metrics, sheets, dashboard) works identically

#### Testing the Integration

```bash
# Test Algolia integration for single facility
npm run cli sync-date 2026-01-10 -- --force --org ucbc --raw-only

# Expected output:
# [Data Source] Using Algolia for W14MolgUu7OYvX4CFQJn on 2026-01-10
# [Algolia Auth] Token obtained, expires at ...
# [Algolia] Total orders fetched: 335
# [Data Source] ✓ Fetched 335 orders from Algolia
```

#### Switching Data Sources

To switch back to Firestore (not recommended unless needed):

```bash
# In .env file, change:
ORDER_DATA_SOURCE=firestore
```

Or for temporary testing:

```bash
ORDER_DATA_SOURCE=firestore npm run cli sync-date 2026-01-10 -- --org ucbc
```

### Organizations (`src/config/organizations.ts`)

Defines the 4 organizations tracked by the system.

```typescript
export const ORGANIZATIONS = [
  {
    id: 'nycbs',
    name: 'NYCBS',
    facilityId: 'HhwIHO4npKhrxyylkC33',
    teamSize: 22,
    expectedDailyOrders: 1200,
  },
  // ... CHC, MBPCC, UCBC
];
```

### Working Days

**Default:**
- Working: Monday - Friday
- Non-working: Saturday, Sunday

**Override:** Add entries to `config_working_days` sheet in Google Sheets.

**Force Sync:** Use `--force` flag to sync non-working days:
```bash
npm run cli sync-date 2025-12-25 --force
```

### Firebase Index

**Required Composite Index:**
- Collection: `medical_pa_orders`
- Fields:
  1. `assigned_to.facility_id` (Ascending)
  2. `auth_on_file.created_at` (Ascending)

**Why:** Firestore requires composite index for queries with multiple `where` clauses.

---

## Deployment

### CLI Sync Automation

**Option 1: Cron Job**

Schedule hourly sync during work hours (11 AM - 8 PM):

```bash
# Add to crontab
0 11-20 * * 1-5 cd /path/to/project && npm run cli sync
```

**Option 2: Cloud Function**

Deploy sync logic as Google Cloud Function with Cloud Scheduler trigger.

**Option 3: GitHub Actions**

Create workflow with cron schedule:

```yaml
on:
  schedule:
    - cron: '0 11-20 * * 1-5'
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run cli sync
```

### Dashboard Deployment

**Option 1: Firebase Hosting**
```bash
npm run build
firebase deploy --only hosting
```

**Option 2: Vercel/Netlify**
- Connect GitHub repo
- Auto-deploy on push
- Configure env vars in platform UI

---

## Troubleshooting

### No Orders Found

**Symptoms:** Sync returns 0 orders for a date with known data.

**Possible Causes:**
1. Wrong date format (must be YYYY-MM-DD)
2. Firebase credentials incorrect
3. Collection path wrong (check `VITE_FIRESTORE_COLLECTION`)
4. Firestore index not created

**Solution:**
```bash
# Verify credentials
echo $VITE_FIREBASE_PROJECT_ID

# Check Firestore Console for data
# Verify index exists in Firebase Console > Firestore > Indexes

# Test with specific date
npm run cli sync-date 2026-01-03
```

### Permission Denied (Google Sheets)

**Symptoms:** Error when writing to Sheets.

**Possible Causes:**
1. Service account email not shared with Sheet
2. Wrong Google Sheets ID
3. Private key formatting issue

**Solution:**
1. Open Google Sheet in browser
2. Click "Share" button
3. Add `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL` with "Editor" access
4. Verify `VITE_GOOGLE_SHEETS_ID` in .env

### Sheet Not Found

**Symptoms:** Error about missing sheet.

**Cause:** Sheets not initialized.

**Solution:**
```bash
npm run cli init
```

### Authentication Errors

**Symptoms:** Firebase or Google Sheets queries fail with auth error.

**Possible Causes:**
1. Invalid service account credentials in `.env`
2. Service account lacks required permissions
3. Private key format incorrect (missing `\n` escaping)

**Solution:**
```bash
# Verify .env has correct credentials
cat .env | grep VITE_GOOGLE

# Check service account email format
# Should be: something@project-id.iam.gserviceaccount.com

# Verify private key format
# Should have literal \n characters: "-----BEGIN PRIVATE KEY-----\nMIIE..."
# NOT actual newlines

# Check permissions on Google Cloud Console:
# 1. Firestore Data Viewer (for Firestore read access)
# 2. Service Account Token Creator (for API authentication)
# 3. Ensure service account has access to the Google Sheets
```

### React App Shows Blank/Loading Screen

**Symptoms:** React app (frontend dashboard) shows infinite loading spinner or blank screen when accessed in browser.

**Possible Causes:**
1. `USE_TEST_MODE` flag is set to `true` in `src/main.tsx` (most common)
2. Missing Firebase environment variables in `.env`
3. Vite dev server needs restart after `.env` changes

**Solution:**
```bash
# 1. Check test mode flag (MOST IMPORTANT)
grep "USE_TEST_MODE" src/main.tsx
# Should show: const USE_TEST_MODE = false;

# 2. Verify Firebase env vars exist
cat .env | grep VITE_FIREBASE

# 3. Restart dev server (required after .env changes)
npm run dev

# 4. Visit diagnostic page to check Firebase config
# Open: http://localhost:5173/diagnostic

# 5. Check browser console (Press F12) for errors
```

**If still stuck after 10 seconds:**
- A "Force Continue" button will appear - click it to bypass auth
- Check the `/diagnostic` page for detailed error information
- Look for Firebase initialization errors in browser console

### Google OAuth Sign-In Not Working

**Symptoms:** Login button doesn't work, popup blocked, or authentication fails.

**Possible Causes:**
1. Google OAuth provider not enabled in Firebase Console
2. Browser blocking popups
3. Authorized domains not configured
4. User email not ending with @risalabs.ai (domain restriction)

**Solution:**

1. **Enable Google OAuth in Firebase Console:**
   - Go to Firebase Console → Authentication → Sign-in method
   - Enable "Google" provider
   - Add authorized domains: `localhost` and your production domain

2. **Configure OAuth in Google Cloud Console:**
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Find OAuth 2.0 Client ID for your Firebase project
   - Add Authorized JavaScript origins:
     - `http://localhost:5173` (Vite dev server)
     - Your production domain
   - Add Authorized redirect URIs:
     - `https://<your-project>.firebaseapp.com/__/auth/handler`

3. **Check Browser Settings:**
   - Allow popups for `localhost:5173`
   - Disable any ad blockers that might block OAuth

4. **Verify Email Domain:**
   - Only `@risalabs.ai` emails are allowed (by design)
   - This is enforced in `src/services/auth.ts`

5. **Test with Diagnostic Page:**
   - Visit `http://localhost:5173/diagnostic`
   - Check if Firebase Auth initializes successfully
   - Look for error messages

---

## Future Enhancements

### Current TODOs

1. **Historical Average Calculation** (`src/services/sync.ts` lines 210, 228)
   - Currently hardcoded to 0
   - Need to implement `getHistoricalOrgMetrics()` query

2. **Dashboard Data Loading** (`src/App.tsx`)
   - UI skeleton complete
   - Need to fetch data from Google Sheets API

3. **Hourly Sync Automation**
   - Manual CLI sync currently
   - Need cron/Cloud Function for automated hourly sync

4. **Charts & Visualizations**
   - Recharts library installed
   - Need to implement trend charts

### Suggested Features

- **Alerts & Notifications:** Email/Slack when pace falls behind
- **Historical Reports:** Weekly/monthly summary reports
- **Provider Leaderboard:** Rank by performance
- **Predictive Analytics:** ML model for EOD prediction
- **Mobile App:** React Native version

---

## Questions the Dashboard Can Answer

### Day Management
- How many orders loaded today vs. yesterday?
- What's our current work rate?
- Are we ahead, on pace, or behind our 7-day average?
- What's the projected end-of-day completion?

### Hourly Trends (with hourly syncs)
- How do orders loaded/assigned/worked change by hour?
- When do most assignments happen?
- What's the hourly work rate progression?

### Organization Comparison
- Which facility has the highest work rate?
- Which facility processes the most orders?
- How does each facility compare to their average?

### Team Performance
- Who are the top performers today?
- Which providers are behind their personal average?
- How is workload distributed across team members?
- Who has capacity to take more orders?

### Historical Analysis
- What's the 7-day trend for orders worked?
- How does today compare to last week?
- Which days of the week have highest volume?

---

**Last Updated:** January 3, 2026
**Version:** 1.0.0
