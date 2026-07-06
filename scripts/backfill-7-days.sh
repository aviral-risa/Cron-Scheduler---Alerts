#!/bin/bash

# Backfill last 7 working days
echo "Starting backfill for last 7 working days..."
echo ""

dates=(
  "2026-01-02"
  "2025-12-31"
  "2025-12-30"
  "2025-12-29"
  "2025-12-26"
  "2025-12-25"
  "2025-12-24"
)

for date in "${dates[@]}"; do
  echo "=========================================="
  echo "Syncing $date..."
  echo "=========================================="
  npm run cli sync-date "$date"
  echo ""
  echo "✓ Completed $date"
  echo ""
done

echo "=========================================="
echo "✓ All 7 days backfilled successfully!"
echo "=========================================="
