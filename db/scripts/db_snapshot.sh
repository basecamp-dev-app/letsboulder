#!/bin/bash
# Database Schema Snapshot Script
# Generates schema snapshot from production database
# Usage: ./scripts/db_snapshot.sh

set -e

echo "Generating database schema snapshot..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set"
    echo "Usage: DATABASE_URL='postgres://...' ./scripts/db_snapshot.sh"
    exit 1
fi

# Generate schema snapshot
pg_dump "$DATABASE_URL" \
    --schema-only \
    --no-owner \
    --no-privileges \
    > db/schema.sql

echo "Generated: db/schema.sql"

# Generate metadata
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" > db/metadata/tables.txt
echo "Generated: db/metadata/tables.txt"

psql "$DATABASE_URL" -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;" > db/metadata/indexes.txt
echo "Generated: db/metadata/indexes.txt"

echo ""
echo "Schema snapshot complete. Modified files:"
git diff --stat db/schema.sql db/metadata/ 2>/dev/null || echo "No changes detected"
