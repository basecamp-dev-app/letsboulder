#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../supabase/migrations"
THRESHOLD=100

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Squash Supabase migrations to reduce migration count.

Options:
  --dry-run        Show what would be squashed without creating files
  --threshold N    Set threshold (default: $THRESHOLD)
  -h, --help       Show this help message

Prerequisites:
  1. Link your Supabase project: supabase link --project-ref <ref>
  2. Ensure you have SUPABASE_ACCESS_TOKEN set

Workflow:
  1. Run with --dry-run to see current migration count
  2. Run: supabase db remote commit
  3. Replace migrations directory with new baseline migration
  4. Commit and push

EOF
  exit 1
}

DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

count=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)

echo "Current migration count: $count"
echo "Threshold: $THRESHOLD"

if [[ "$count" -le "$THRESHOLD" ]]; then
  echo "Migration count is below threshold. No squashing needed."
  exit 0
fi

echo ""
echo "Migration count exceeds threshold!"
echo "To squash migrations:"
echo ""
echo "  1. Link your project:"
echo "     supabase link --project-ref <your-project-ref>"
echo ""
echo "  2. Run remote commit:"
echo "     supabase db remote commit"
echo ""
echo "  3. This creates a migration file with current schema"
echo "  4. Replace all existing migrations with the new baseline"
echo "  5. Commit and push"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run complete. No files created."
  exit 0
fi

echo "Run 'supabase db remote commit' to generate the squashed migration."
