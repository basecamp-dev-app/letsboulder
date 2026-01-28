#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/db/list-applied-migrations.sh <DATABASE_URL>" >&2
  exit 2
fi

DATABASE_URL="$1"

psql "$DATABASE_URL" -Atc "select version from supabase_migrations.schema_migrations order by version;"
