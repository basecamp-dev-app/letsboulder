#!/usr/bin/env bash
# Lightweight doc verification — catches common drift patterns.
# Run: bash docs/verify.sh
# Exit 0 = all checks passed, Exit 1 = drift detected
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

echo "=== Doc Verification ==="

# 0. Required documentation and package commands referenced by contributor docs
for path in \
  "README.md" \
  "LOCAL_SETUP.md" \
  "CONTRIBUTING.md" \
  "docs/README.md" \
  "docs/architecture.md" \
  "docs/open-data-exports.md" \
  "docs/submission-workflow.md" \
  "docs/media-pipeline.md" \
  "docs/moderation.md" \
  "docs/ui/submission-controls.md"; do
  if [ ! -f "$ROOT/$path" ]; then
    echo "DRIFT: documented file is missing: $path"
    ERRORS=$((ERRORS + 1))
  fi
done

if ! node "$ROOT/scripts/verify-markdown-links.mjs"; then
  ERRORS=$((ERRORS + 1))
fi

for script in lint typecheck check:features test:unit test:components test:database test:integration; do
  if ! node -e "const p=require('$ROOT/package.json'); process.exit(p.scripts?.['$script'] ? 0 : 1)"; then
    echo "DRIFT: documented package script is missing: $script"
    ERRORS=$((ERRORS + 1))
  fi
done

NODE_VERSION=$(tr -d '[:space:]' < "$ROOT/.nvmrc")
if grep -q "Node.js \`$NODE_VERSION\`" "$ROOT/README.md"; then
  echo "OK: README Node version matches .nvmrc ($NODE_VERSION)"
else
  echo "DRIFT: README Node version disagrees with .nvmrc ($NODE_VERSION)"
  ERRORS=$((ERRORS + 1))
fi

# 1. Rate limit tier count (count lines matching actual tier definitions, not interface)
TIER_COUNT=$(grep -c "tokens: [0-9]" "$ROOT/lib/rate-limit-config.ts")
if grep -q "($TIER_COUNT tiers" "$ROOT/docs/architecture.md"; then
  echo "OK: Rate limit tier count ($TIER_COUNT) matches architecture.md"
else
  echo "DRIFT: architecture.md rate-limit tiers disagree with actual ($TIER_COUNT)"
  ERRORS=$((ERRORS + 1))
fi

# 2. Route table vs actual directories that contain route.ts files
TABLE_ROUTES=$(sed -nE 's/^\| ([a-z][a-z-]*) \|.*/\1/p' "$ROOT/docs/api/routes.md" | sort)
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
