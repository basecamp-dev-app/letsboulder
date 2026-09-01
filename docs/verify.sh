#!/usr/bin/env bash
# Lightweight doc verification — catches common drift patterns.
# Run: bash docs/verify.sh
# Exit 0 = all checks passed, Exit 1 = drift detected
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
VERIFY_TMP_DIR="$(mktemp -d "$ROOT/.docs-verify.XXXXXX")"
trap 'rm -r -- "$VERIFY_TMP_DIR"' EXIT

echo "=== Doc Verification ==="

# 0. Required documentation and package commands referenced by contributor docs
for path in \
  "AGENTS.md" \
  "README.md" \
  "LOCAL_SETUP.md" \
  "CONTRIBUTING.md" \
  "docs/README.md" \
  "docs/architecture.md" \
  "docs/feature-structure.md" \
  "docs/testing/README.md" \
  "docs/testing/offline-device-release-checklist.md" \
  "docs/db/schema.md" \
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

for script in lint lint:features typecheck check:features check:architecture check:csrf-fetch check:type-drift test:unit test:components test:database test:e2e test:e2e:offline build; do
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

# 2. Route table vs actual top-level route groups
TABLE_ROUTES=$(sed -nE 's/^\| ([a-z][a-z-]*) \|.*/\1/p' "$ROOT/docs/api/routes.md" | sort)
ACTUAL_DIRS=$(find "$ROOT/app/api" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
  if find "$dir" -name "route.ts" -print -quit | grep -q .; then
    basename "$dir"
  fi
done | sort)
printf '%s\n' "$ACTUAL_DIRS" > "$VERIFY_TMP_DIR/actual-dirs"
printf '%s\n' "$TABLE_ROUTES" > "$VERIFY_TMP_DIR/table-routes"
MISSING=$(comm -23 "$VERIFY_TMP_DIR/actual-dirs" "$VERIFY_TMP_DIR/table-routes")
EXTRA=$(comm -13 "$VERIFY_TMP_DIR/actual-dirs" "$VERIFY_TMP_DIR/table-routes")

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

# 3. Canonical endpoint inventory vs every nested route.ts path
DOCUMENTED_PATHS=$(awk '
  /^<!-- API ROUTES START -->$/ { in_inventory = 1; next }
  /^<!-- API ROUTES END -->$/ { in_inventory = 0 }
  in_inventory && /^\/api\// { print }
' "$ROOT/docs/api/routes.md" | sort)
ACTUAL_PATHS=$(find "$ROOT/app/api" -type f -name "route.ts" -print \
  | sed -E "s#^$ROOT/app/api/(.*)/route\\.ts#/api/\1#" | sort)
printf '%s\n' "$ACTUAL_PATHS" > "$VERIFY_TMP_DIR/actual-paths"
printf '%s\n' "$DOCUMENTED_PATHS" > "$VERIFY_TMP_DIR/documented-paths"
MISSING_PATHS=$(comm -23 "$VERIFY_TMP_DIR/actual-paths" "$VERIFY_TMP_DIR/documented-paths")
EXTRA_PATHS=$(comm -13 "$VERIFY_TMP_DIR/actual-paths" "$VERIFY_TMP_DIR/documented-paths")

if [ -z "$MISSING_PATHS" ] && [ -z "$EXTRA_PATHS" ]; then
  echo "OK: Endpoint inventory matches app/api/**/route.ts paths"
else
  if [ -n "$MISSING_PATHS" ]; then
    echo "DRIFT: routes.md missing endpoint paths: $MISSING_PATHS"
    ERRORS=$((ERRORS + 1))
  fi
  if [ -n "$EXTRA_PATHS" ]; then
    echo "DRIFT: routes.md lists non-existent endpoint paths: $EXTRA_PATHS"
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
