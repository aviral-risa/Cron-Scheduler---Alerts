# Algolia Integration Test

This folder contains a standalone test implementation to validate using Algolia API as an alternative fast data source for order data extraction.

## Purpose

**NOT a migration** - This tests integrating Algolia as a **secondary fast query layer** alongside Firestore (not replacing it). Algolia provides sub-2-second response times regardless of order count, while Firestore queries take several minutes.

### Key Points
- **Algolia is an additional data source**, not a replacement for Firestore
- **Firestore remains** for other data needs not available in Algolia
- **Upper layers unchanged** - all metrics calculations, UI, and Google Sheets structure stay the same
- **Goal**: Validate if Algolia can provide raw order data with backward-compatible structure

## Architecture

```
Test Flow:
┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│   Algolia   │ ───> │  Transform   │ ───> │   Validate    │
│     API     │      │  to Snapshot │      │     Data      │
└─────────────┘      └──────────────┘      └───────────────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │ Test Google   │
                                            │    Sheet      │
                                            └───────────────┘
```

## Phase 1 Scope

- **Test Date**: January 9, 2026
- **Facility**: NYCBS only (HhwIHO4npKhrxyylkC33)
- **Data**: Raw order snapshots only (12 fields)
- **Validation**: Structure and field integrity
- **Output**: Test Google Sheet (orders_raw_hourly tab)

## Setup

### Prerequisites
- Node.js 18+ with npm
- Access to Algolia API credentials
- Google Service Account with Sheets API access
- Test Google Sheet created with proper headers

### Installation

1. Install dependencies (from parent directory):
```bash
cd account-management-dashboard
npm install
```

2. Verify `.env.test` configuration:
```bash
cat algolia_integration_test/.env.test
```

Should contain:
- Algolia API endpoints and credentials
- Test Google Sheet ID
- Google Service Account credentials

## Usage

### Run Full Test

Test with default settings (NYCBS, Jan 9, 2026):
```bash
npm run test:algolia
```

### Custom Date and Facility

```bash
npm run test:algolia -- --date 2026-01-09 --facility HhwIHO4npKhrxyylkC33
```

Available facilities:
- `HhwIHO4npKhrxyylkC33` - NYCBS (~1200 orders/day)
- `4BlQ4SsqAVTDgFKApKZr` - CHC (~600 orders/day)
- `3GKbZtgpPru1vJGCkxwR` - MBPCC (~400 orders/day)
- `W14MolgUu7OYvX4CFQJn` - UCBC (~300 orders/day)

## Expected Output

```
=== Algolia Integration Test - Raw Data ===
Test Date: 2026-01-09
Facility: NYCBS (HhwIHO4npKhrxyylkC33)

=== Step 1: Fetch Orders from Algolia ===
[Auth] Fetching new bearer token...
[Auth] ✓ Token obtained, expires at 2026-01-10T19:30:00Z
[Fetch] Fetching orders for facility HhwIHO4npKhrxyylkC33 on 2026-01-09...
[Fetch] Page 0: 1243 orders, 1 total pages
[Fetch] ✓ Total orders fetched: 1243

=== Step 2: Transform to OrderSnapshot Format ===
[Transform] Transforming 1243 orders...
[Transform] ✓ Transformation complete: 1243/1243 successful

=== Step 3: Validate Data Integrity ===
[Validate] Running validation checks...
[Validate] ✓ Field presence: 1243/1243 (100.0%)
[Validate] ✓ Field types: 1243/1243 (100.0%)
[Validate] ✓ Date formats: 1243/1243 (100.0%)
[Validate] ✓ Derived logic: 1243/1243 (100.0%)

[Validate] Statistics:
[Validate]   Total orders: 1243
[Validate]   Assigned: 1189 (95.7%)
[Validate]   Worked: 1156 (93.0%)
[Validate]   Unassigned: 54 (4.3%)

=== Step 4: Write to Test Google Sheet ===
[Sheets] Writing 1243 snapshots to test sheet...
[Sheets] ✓ Successfully written to orders_raw_hourly

=== Test Summary ===
✓ All steps completed successfully!
Total orders fetched: 1243
Total snapshots created: 1243
Overall validation: 100.0% pass rate
Execution time: 4.52s

Test Sheet URL: https://docs.google.com/spreadsheets/d/1BcN9RJspVsTDXgxCGRX4dSYRvHwbUpkyfNziY8PD0O0

✓ Performance: 4.52s (target: <30s)
```

## Field Mapping

Algolia API fields are mapped to OrderSnapshot format (12 fields):

| OrderSnapshot Field | Algolia API Field | Transformation |
|---------------------|-------------------|----------------|
| `order_id` | `objectID` or `id` | Direct |
| `facility_id` | `org_id` | Direct |
| `provider_name` | `assigned_to_name` | Null if "unassigned" |
| `master_auth_status` | `master_auth_status` | Direct |
| `created_at` | `created_at_iso` | UTC → IST conversion |
| `created_at_date` | `created_at_iso` | Extract date, IST |
| `assigned_at` | `assigned_at_iso` | UTC → IST conversion |
| `date_of_work` | `date_of_work_iso` | UTC → IST conversion |
| `is_assigned` | Derived | `!!provider_name && name !== 'unassigned'` |
| `is_worked` | Derived | `!!date_of_work_iso` |
| `snapshot_timestamp` | Current time | IST format |
| `snapshot_hour_ist` | Current hour | IST (0-23) |

## File Structure

```
algolia_integration_test/
├── config/
│   ├── algolia.config.ts          # Algolia API configuration
│   └── test-sheet.config.ts       # Test sheet & organizations config
├── services/
│   ├── algolia-auth.service.ts    # Token management (fetch, cache, refresh)
│   ├── algolia-fetch.service.ts   # Data fetching with pagination
│   ├── algolia-transform.service.ts # Transform Algolia → OrderSnapshot
│   ├── validation.service.ts      # Data validation & integrity checks
│   └── test-sheets.service.ts     # Google Sheets integration
├── types/
│   └── algolia.types.ts           # TypeScript interfaces
├── utils/
│   ├── timezone.ts                # IST timezone conversion utilities
│   └── logger.ts                  # Structured console logging
├── scripts/
│   └── test-algolia-raw.ts        # Main test entry point
├── .env.test                      # Configuration (not in git)
└── README.md                      # This file
```

## Validation Checks

The test performs comprehensive validation:

1. **Field Presence**: All 12 required fields must exist
2. **Field Types**: Correct TypeScript types per OrderSnapshot interface
3. **Date Formats**:
   - Timestamps: "YYYY-MM-DD HH:MM:SS" (IST)
   - Dates: "YYYY-MM-DD" (IST)
4. **Derived Logic**:
   - `is_assigned = true` ↔ `provider_name` is not null/unassigned
   - `is_worked = true` ↔ `date_of_work` is not null/empty
5. **Timezone Conversion**: All timestamps correctly converted from UTC to IST (UTC+5:30)

## Success Criteria

- [ ] Successfully authenticate and fetch bearer token
- [ ] Fetch ~1200+ orders from Algolia for NYCBS on Jan 9, 2026
- [ ] Transform all orders to OrderSnapshot format (12 fields each)
- [ ] 100% validation pass rate (all fields present, correct types, valid formats)
- [ ] Successfully write to test Google Sheet
- [ ] Clear console logs showing progress and validation results
- [ ] Script completes in <30 seconds (vs several minutes for Firestore)

## Troubleshooting

### Error: "Token expired"
- Token has 40-minute lifetime, automatically refreshed
- If persists, check credentials in `.env.test`

### Error: "HTTP 401" or "Authentication failed"
- Verify `ALGOLIA_USERNAME` and `ALGOLIA_PASSWORD` in `.env.test`
- Check if credentials are still valid

### Error: "Failed to write to Google Sheets"
- Verify Google Service Account credentials in `.env.test`
- Ensure service account has edit access to test sheet
- Check `TEST_GOOGLE_SHEETS_ID` is correct

### No orders found
- Verify the date has data: check production dashboard
- Ensure facility ID is correct
- Try a different date with known data

### Validation errors
- Check console output for specific field issues
- Review transformation logic in `algolia-transform.service.ts`
- Verify Algolia API response structure hasn't changed

## Next Steps (Phase 2)

After Phase 1 success:
- [ ] Expand to all 4 facilities
- [ ] Integrate Algolia as alternative data source in production code
- [ ] Add logic to choose data source: Algolia (fast path) or Firestore (fallback)
- [ ] Implement metrics calculations (org + person + daily summary)
- [ ] Side-by-side Firestore comparison for validation
- [ ] Performance benchmarking
- [ ] Document what data comes from Algolia vs Firestore

## Important Notes

- **DO NOT modify production code** in `src/` folder
- **DO NOT write to production Google Sheet** (ID: 1foCZzx2RwBKWn01l8ooQxZrOlgI0YP5HAYLE87nYOTs)
- All test work is isolated in `algolia_integration_test/` folder
- Test sheet ID: `1BcN9RJspVsTDXgxCGRX4dSYRvHwbUpkyfNziY8PD0O0`

## Contact

For questions or issues with this test implementation, please reach out to the development team.
