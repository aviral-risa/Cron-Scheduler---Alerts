#!/bin/bash

# Backfill Unique Order Status data for January 2026
# NYCBS, CHC, UCBC, MBPCC: Jan 1-20
# SunState: Jan 9-20

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════"
echo "  Backfilling Unique Order Status - January 2026"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Date ranges:"
echo "  - NYCBS, CHC, UCBC, MBPCC: January 1-20, 2026"
echo "  - SunState: January 9-20, 2026"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Function to sync a date for a specific org
sync_date_org() {
  local date=$1
  local org=$2
  echo ""
  echo "[$org] Syncing $date..."
  npm run cli sync-date "$date" -- --sync-unique-status --org "$org"

  if [ $? -eq 0 ]; then
    echo "✅ [$org] $date completed successfully"
  else
    echo "❌ [$org] $date failed"
    exit 1
  fi
}

# Organizations for Jan 1-20
orgs_full=("nycbs" "chc" "ucbc" "mbpcc")

# Dates Jan 1-8 (only for NYCBS, CHC, UCBC, MBPCC)
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Phase 1: January 1-8 (NYCBS, CHC, UCBC, MBPCC)"
echo "════════════════════════════════════════════════════════════════"

for date in 2026-01-{01..08}; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Processing $date"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  for org in "${orgs_full[@]}"; do
    sync_date_org "$date" "$org"
  done
done

# Dates Jan 9-20 (all organizations including SunState)
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Phase 2: January 9-20 (All Organizations)"
echo "════════════════════════════════════════════════════════════════"

orgs_all=("nycbs" "chc" "ucbc" "mbpcc" "sunstate")

for date in 2026-01-{09..20}; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Processing $date"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  for org in "${orgs_all[@]}"; do
    sync_date_org "$date" "$org"
  done
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Backfill completed successfully!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  - Jan 1-8: 4 orgs × 8 days = 32 syncs"
echo "  - Jan 9-20: 5 orgs × 12 days = 60 syncs"
echo "  - Total: 92 syncs completed"
echo ""
