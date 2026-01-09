#!/bin/bash
# Database Schema Validation Script
# Validates local schema matches migration files
# Usage: ./scripts/db_validate.sh

set -e

echo "Validating database schema..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set"
    echo "Usage: DATABASE_URL='postgres://...' ./scripts/db_validate.sh"
    exit 1
fi

# Check all migration files exist
echo "Checking migration files..."
for file in db/migrations/*.sql; do
    if [ -f "$file" ]; then
        echo "  ✓ $(basename $file)"
    else
        echo "  ✗ Missing: $file"
        exit 1
    fi
done

# Validate tables exist
echo ""
echo "Validating database tables..."
for table in $(cat db/metadata/tables.txt 2>/dev/null | grep -v '^$'); do
    exists=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.tables WHERE table_name='$table' AND table_schema='public';")
    if [ -z "$exists" ]; then
        echo "  ✗ Missing table: $table"
        exit 1
    fi
    echo "  ✓ $table"
done

# Check for required columns in key tables
echo ""
echo "Validating key table columns..."

# Check climbs table
for col in id name grade crag_id user_id status created_at; do
    exists=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.columns WHERE table_name='climbs' AND column_name='$col';")
    if [ -z "$exists" ]; then
        echo "  ✗ Missing column: climbs.$col"
        exit 1
    fi
done
echo "  ✓ climbs table"

# Check crags table
for col in id name latitude longitude; do
    exists=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.columns WHERE table_name='crags' AND column_name='$col';")
    if [ -z "$exists" ]; then
        echo "  ✗ Missing column: crags.$col"
        exit 1
    fi
done
echo "  ✓ crags table"

# Check regions table (if it exists)
table_exists=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.tables WHERE table_name='regions' AND table_schema='public';")
if [ -n "$table_exists" ]; then
    for col in id name; do
        exists=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.columns WHERE table_name='regions' AND column_name='$col';")
        if [ -z "$exists" ]; then
            echo "  ✗ Missing column: regions.$col"
            exit 1
        fi
    done
    echo "  ✓ regions table"
fi

echo ""
echo "✓ Schema validation passed!"
