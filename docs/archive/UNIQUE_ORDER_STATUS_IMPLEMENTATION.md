# Unique Order Status Implementation

## Overview

Implemented a new **unique_orders_status** sheet that maintains the latest state of each order with comprehensive change tracking, including specific **auth_status** transition tracking for analytics.

## Architecture

### 3-Spreadsheet Design

```
RAW_DATA_SHEETS_ID       → Append-only snapshots (~324k cells/day)
DASHBOARD_SHEETS_ID      → Time-windowed metrics (~40k cells with retention)
UNIQUE_STATUS_SHEETS_ID  → Cumulative order states (NEW - 40 columns/order)
```

### Data Flow (3-Layer Pipeline)

```
syncOrgData()
  ├─ Layer 1: syncRawData() → orders_raw_hourly (RAW_DATA)
  ├─ Layer 2: calculateMetricsFromSnapshots() → metrics (DASHBOARD)
  └─ Layer 3: syncUniqueOrdersStatus() → unique_orders_status (UNIQUE_STATUS)
```

## Sheet Schema (40 Columns)

### Primary Key (1 column)
- **order_id** - Unique order identifier

### Tracked Fields from Algolia (29 columns)
Critical fields for meta calculations:
- created_at_iso, indexed_at_iso, assigned_to_name, primary_payer_name
- regimen_name, date_of_service_iso, org_id, primary_active
- ev_bv_primary, document_upload_status, ev_write_back_status, bo_status
- master_auth_status, mark_as_completed, auth_on_file_status
- auth_on_file_updated_at, **auth_status**, medical_order_status
- regimen_type, auth_on_file_error_type, auth_on_file_error_message
- nar_check_status, date_of_work_iso, assigned_at_iso
- health_first_nar_rpa_status, submission, fax_submission_status
- medical_order_review_status

### General Change Tracking (6 columns)
- **fields_hash** - MD5 hash of all 29 tracked fields
- **first_synced_at** - IST timestamp when order first added
- **last_synced_at** - IST timestamp of most recent sync (updates every time)
- **last_changed_at** - IST timestamp when fields last changed
- **sync_count** - Number of times order synced
- **change_count** - Number of times fields changed

### Auth Status Specific Tracking (5 columns)
**NEW: Tracks auth_status transitions for analytics**
- **auth_status_ever_changed** (boolean) - True if auth_status ever changed
- **auth_status_change_count** (number) - How many times auth_status changed
- **auth_status_last_change_from** (string) - Previous auth_status value
- **auth_status_last_change_to** (string) - Current auth_status value
- **auth_status_last_changed_at** (timestamp) - When auth_status last changed

## Change Detection Strategy

### Hash-Based Comparison
- Generate MD5 hash of all 29 tracked fields
- Compare hash on each sync to detect ANY field change
- Fast single string comparison vs field-by-field checks

### Auth Status Transition Tracking
- **Separate tracking** for auth_status field specifically
- Captures `from → to` transitions for analytics
- Enables questions like:
  - "Show orders where auth_status ever changed"
  - "What are most common auth_status transitions?"
  - "How often does auth_status change per order?"

### Performance Optimizations
- **In-memory hash map** of existing orders (built once per sync)
- **Batch updates** (collect changes, write in batches)
- **Conditional writes** (only write if hash differs or auth_status changed)
- **Early exit** if no changes detected

## Files Created

### Core Services
1. **`src/types/orders.ts`** - Added `UniqueOrderStatus` interface (40 fields)
2. **`src/utils/crypto.ts`** - MD5 hash generation utility
3. **`src/services/algolia/unique-status-transform.service.ts`** - Transform & change detection
4. **`src/scripts/init-unique-order-status-sheet.ts`** - Sheet initialization script

### Modified Files
1. **`src/config/data-source.config.ts`** - Added `UNIQUE_STATUS_SHEETS_ID` and 3-sheet support
2. **`src/services/sheets-dual.ts`** - Added UPSERT operations for unique order status
3. **`src/services/data-source.ts`** - Return both snapshots and raw Algolia orders
4. **`src/services/sync.ts`** - Integrated Layer 3 sync orchestration
5. **`src/cli.ts`** - Added `--sync-unique-status` flag
6. **`package.json`** - Added `init-unique-status-sheet` script
7. **`.env.example`** - Documented new environment variables

## Setup & Usage

### 1. Create New Spreadsheet

Create a new Google Spreadsheet for unique order status and copy its ID.

### 2. Configure Environment Variables

Add to `.env`:

```bash
# Multi-spreadsheet architecture
VITE_RAW_DATA_SHEETS_ID=your_raw_data_sheets_id
VITE_DASHBOARD_SHEETS_ID=your_dashboard_sheets_id
VITE_UNIQUE_STATUS_SHEETS_ID=your_new_unique_status_sheets_id  # NEW

# Enable unique order status sync
ENABLE_UNIQUE_ORDER_STATUS_SYNC=true
```

### 3. Initialize Sheet

```bash
npm run init-unique-status-sheet
```

This creates the `unique_orders_status` sheet with proper headers (40 columns).

### 4. Run Sync with Unique Status Tracking

```bash
# Sync with unique order status enabled
npm run cli sync-date 2026-02-03 -- --sync-unique-status

# Sync specific org with unique status
npm run cli sync-date 2026-02-03 -- --org nycbs --sync-unique-status

# Enable by default (no flag needed)
export ENABLE_UNIQUE_ORDER_STATUS_SYNC=true
npm run cli sync-date 2026-02-03
```

### 5. Verify Results

Check the `unique_orders_status` sheet:
- ✅ Row count matches order count
- ✅ No duplicate order_ids
- ✅ All 40 columns populated
- ✅ `auth_status_ever_changed` set correctly
- ✅ `auth_status_last_change_from/to` populated when auth_status changed

### 6. Re-run to Test Change Detection

```bash
# Run same sync again - should detect no changes
npm run cli sync-date 2026-02-03 -- --sync-unique-status

# Expected output:
# [ORG] Changes detected: 0 new, 0 updated, N unchanged
# [ORG] ℹ️  No changes to write
```

## Analytics Use Cases

### General Change Tracking
```sql
-- Orders that have changed in last 24 hours
SELECT * FROM unique_orders_status
WHERE last_changed_at > NOW() - INTERVAL 24 HOUR

-- Most frequently changing orders
SELECT order_id, change_count
FROM unique_orders_status
ORDER BY change_count DESC
LIMIT 10
```

### Auth Status Transition Analytics
```sql
-- All orders where auth_status ever changed
SELECT * FROM unique_orders_status
WHERE auth_status_ever_changed = true

-- Most common auth_status transitions
SELECT
  auth_status_last_change_from as from_status,
  auth_status_last_change_to as to_status,
  COUNT(*) as transition_count
FROM unique_orders_status
WHERE auth_status_ever_changed = true
GROUP BY auth_status_last_change_from, auth_status_last_change_to
ORDER BY transition_count DESC

-- Orders with multiple auth_status changes
SELECT * FROM unique_orders_status
WHERE auth_status_change_count > 1
ORDER BY auth_status_change_count DESC

-- Recent auth_status changes
SELECT
  order_id,
  auth_status_last_change_from,
  auth_status_last_change_to,
  auth_status_last_changed_at
FROM unique_orders_status
WHERE auth_status_last_changed_at > NOW() - INTERVAL 7 DAY
ORDER BY auth_status_last_changed_at DESC
```

## Performance Expectations

| Scenario | Expected Time |
|----------|---------------|
| Initial sync (1000 orders, all new) | ~30-45s |
| Typical sync (1000 orders, 10% changed) | ~10-15s |
| No-op sync (no changes) | ~5-8s |

## Edge Cases Handled

| Edge Case | Strategy |
|-----------|----------|
| Order deleted from Algolia | Keep in sheet (audit trail) |
| First sync (empty sheet) | All orders are inserts |
| Missing required fields | Log warning, skip order |
| Algolia timeout | Existing retry logic (3 attempts) |
| Auth status never changed | Fields remain null/0 |
| Multiple rapid syncs | Update timestamps correctly |

## Feature Flag Control

The unique order status sync can be controlled via:

1. **Environment variable** (persistent):
   ```bash
   ENABLE_UNIQUE_ORDER_STATUS_SYNC=true
   ```

2. **CLI flag** (per-run):
   ```bash
   --sync-unique-status
   ```

3. **Conditional in code**:
   ```typescript
   if (process.env.ENABLE_UNIQUE_ORDER_STATUS_SYNC === 'true' && algoliaOrders) {
     uniqueOrderStatus = await syncUniqueOrdersStatus(algoliaOrders, facilityId, facilityName);
   }
   ```

## Benefits

### Scalability
✅ **Independent growth** - Unique status sheet won't impact raw/dashboard capacity
✅ **~250k orders capacity** before hitting 10M cell limit (40 cells × 250k = 10M)
✅ **Efficient UPSERT** - Only writes changed orders

### Analytics
✅ **Latest state** - Always current order status (not time-windowed snapshots)
✅ **Change frequency** - Track how often each order changes
✅ **Auth status transitions** - Analyze auth_status evolution patterns
✅ **Audit trail** - First/last sync timestamps, change counts

### Maintainability
✅ **Clear separation** - Status data separate from raw/metrics
✅ **Feature-flagged** - Easy to enable/disable
✅ **Hash-based detection** - Simple, fast change detection
✅ **Existing patterns** - Follows sheets-dual.ts UPSERT pattern

## Monitoring

Check sync logs for:
```
[ORG] Starting unique order status sync for N orders...
[ORG] Found M existing order statuses
[ORG] Changes detected: X new, Y updated, Z unchanged
[ORG] ✅ Wrote W order statuses to UNIQUE_STATUS
[ORG] ✓ Unique order status sync completed in Nms
```

## Troubleshooting

### Sheet Not Found
```
Error: UNIQUE_STATUS_SHEETS_ID not configured
```
→ Set `VITE_UNIQUE_STATUS_SHEETS_ID` in `.env` and run `npm run init-unique-status-sheet`

### No Changes Written
```
[ORG] ℹ️  No changes to write
```
→ Expected! Means all orders unchanged since last sync (hash matches)

### Auth Status Tracking Not Working
Check:
1. `auth_status_ever_changed` should be `true` if auth_status changed
2. `auth_status_last_change_from` should have previous value
3. `auth_status_last_change_to` should have current value
4. Re-run sync after changing auth_status in Algolia to verify

## Next Steps

### Recommended Enhancements
1. **Historical auth_status tracking** - Store full change history as JSON array
2. **Backfill script** - Populate sheet with historical data
3. **Dashboard visualization** - Chart auth_status transition flows
4. **Alert on specific transitions** - E.g., "auth_required → denial_by_risa"
5. **Change velocity metrics** - Track orders changing too frequently

### Future Optimizations
1. **Batch UPSERT** - Update multiple rows in single API call (Google Sheets API limitation)
2. **Parallel writes** - Write to sheet while processing next batch
3. **Incremental hash** - Only recalculate hash for changed fields
4. **Compression** - Store field history in compressed format

---

**Implementation Date:** 2026-02-03
**Status:** ✅ Complete and tested
**Spreadsheet Architecture:** 3-spreadsheet (RAW + DASHBOARD + UNIQUE_STATUS)
