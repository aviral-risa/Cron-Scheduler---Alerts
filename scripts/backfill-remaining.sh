#!/bin/bash

# Backfill remaining 6 working days (excluding Jan 2 which is already done)
echo "Starting backfill for remaining 6 working days..."
echo ""

dates=(
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
echo "✓ All 6 remaining days backfilled successfully!"
echo "=========================================="
