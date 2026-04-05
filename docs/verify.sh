#!/usr/bin/env bash
# Lightweight doc verification — catches common drift patterns.
# Run: bash docs/verify.sh
# Exit 0 = all checks passed, Exit 1 = drift detected
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

echo "=== Doc Verification ==="

# 1. Migration count
MIGRATION_COUNT=$(ls "$ROOT/supabase/migrations" | wc -l | tr -d ' ')
if grep -q "($MIGRATION_COUNT files" "$ROOT/docs/architecture.md"; then
  echo "OK: Migration count ($MIGRATION_COUNT) matches architecture.md"
else
  echo "DRIFT: architecture.md migration count disagrees with actual ($MIGRATION_COUNT)"
  ERRORS=$((ERRORS + 1))
fi

# 2. Rate limit tier count (count lines matching actual tier definitions, not interface)
TIER_COUNT=$(grep -c "tokens: [0-9]" "$ROOT/lib/rate-limit-config.ts")
if grep -q "($TIER_COUNT tiers" "$ROOT/docs/architecture.md"; then
  echo "OK: Rate limit tier count ($TIER_COUNT) matches architecture.md"
else
  echo "DRIFT: architecture.md rate-limit tiers disagree with actual ($TIER_COUNT)"
  ERRORS=$((ERRORS + 1))
fi

# 3. Route table vs actual directories that contain route.ts files
TABLE_ROUTES=$(grep -oP '^\| \K[a-z-]+(?= \|)' "$ROOT/docs/api/routes.md" | grep -v '^-*-$' | sort)
ACTUAL_DIRS=$(find "$ROOT/app/api" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
  if find "$dir" -name "route.ts" -print -quit | grep -q .; then
    basename "$dir"
  fi
done | sort)
MISSING=$(comm -23 <(echo "$ACTUAL_DIRS") <(echo "$TABLE_ROUTES"))
EXTRA=$(comm -13 <(echo "$ACTUAL_DIRS") <(echo "$TABLE_ROUTES"))

if [ -z "$MISSING" ] && [ -z "$EXTRA" ]; then
  echo "OK: Route table matches app/api/ directories"
else
  if [ -n "$MISSING" ]; then
    echo "DRIFT: routes.md missing routes: $MISSING"
    ERRORS=$((ERRORS + 1))
  fi
  if [ -n "$EXTRA" ]; then
    echo "DRIFT: routes.md lists non-existent routes: $EXTRA"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "$ERRORS drift issue(s) found"
  exit 1
fi
echo "All checks passed"
exit 0
