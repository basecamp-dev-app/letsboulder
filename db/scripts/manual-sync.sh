#!/bin/bash
# Manual Database Sync Script
# Run this locally to sync production data to your development database
# Usage: ./db/scripts/manual-sync.sh

set -e

echo "🔄 Manual Database Sync: Production → Local Development"
echo "======================================================="
echo ""

# Check if local database is running
if ! docker ps | grep -q "gsyrocks-db"; then
    echo "❌ Local database not running"
    echo "Start it with: cd ~/supabase-local && docker compose up -d"
    exit 1
fi

echo "✅ Local database is running"

# Check if SUPABASE_DB_URL is set
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "❌ SUPABASE_DB_URL not set"
    echo "Set it with: export SUPABASE_DB_URL='postgresql://postgres:YOUR_PASSWORD@db.glxnbxbkedeogtcivpsx.supabase.co:5432/postgres'"
    echo ""
    echo "Get password from: https://supabase.com/dashboard → Settings → Database"
    exit 1
fi

echo "✅ Database URL configured"

# Parse connection string
IFS='@' read -r user_part host_part <<< "$SUPABASE_DB_URL"
IFS=':' read -r user password <<< "${user_part#postgresql://}"
IFS=':' read -r host port_db <<< "$host_part"
IFS='/' read -r port dbname <<< "$port_db"

echo "📡 Connecting to Supabase..."
echo "Host: $host"
echo "Port: $port"
echo "Database: $dbname"

# Create directories
mkdir -p db/schema db/data

echo ""
echo "📊 Downloading schema..."
if pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner > db/schema/production_schema.sql; then
    echo "✅ Schema downloaded: $(wc -l < db/schema/production_schema.sql) lines"
else
    echo "❌ Schema download failed"
    echo "Check your SUPABASE_DB_URL and Supabase network access"
    exit 1
fi

echo ""
echo "📦 Downloading data..."
if pg_dump "$SUPABASE_DB_URL" --data-only --no-owner > db/data/production_data.sql; then
    echo "✅ Data downloaded: $(wc -l < db/data/production_data.sql) lines"
else
    echo "❌ Data download failed"
    echo "This might be expected if there are large tables"
fi

echo ""
echo "🔄 Applying to local database..."

# Apply schema
echo "Applying schema..."
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/schema/production_schema.sql >/dev/null 2>&1
echo "✅ Schema applied"

# Apply data
echo "Applying data..."
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/data/production_data.sql >/dev/null 2>&1
echo "✅ Data applied"

echo ""
echo "🎉 Sync complete!"
echo ""
echo "Your local database now matches production."
echo "Run 'npm run dev' to start development."
