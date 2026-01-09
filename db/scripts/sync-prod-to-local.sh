#!/bin/bash
# Sync script: Pull production Supabase data to local Docker database
# Usage: ./scripts/sync-prod-to-local.sh
# CAUTION: This OVERWRITES local data with production data!

set -e

echo "🔄 Starting sync: Production → Local Development"
echo "⚠️  WARNING: This will overwrite ALL local data!"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed.${NC}" >&2; exit 1; }

# Confirm before proceeding
read -p "Continue with sync? (type 'yes' to confirm): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Sync cancelled."
    exit 0
fi

echo ""
echo "Step 1: Stopping local database..."
cd ~/supabase-local
docker compose down

echo ""
echo "Step 2: Removing old local data volume..."
docker volume rm supabase-local_pgdata 2>/dev/null || true

echo ""
echo "Step 3: Starting fresh database container..."
docker compose up -d

echo ""
echo "Step 4: Waiting for database to be ready..."
for i in {1..30}; do
    if docker exec gsyrocks-db pg_isready -U postgres >/dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Database failed to start${NC}"
        exit 1
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

echo ""
echo "Step 5: Applying schema migrations..."
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/migrations/000001_initial_schema.sql >/dev/null 2>&1
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/migrations/000002_add_regions.sql >/dev/null 2>&1

echo ""
echo "Step 6: Syncing data from production Supabase..."
echo -e "${YELLOW}Option A: Use Supabase CLI (if available)${NC}"
echo "supabase db dump --linked --data-only | psql -h localhost -U postgres -d postgres"
echo ""
echo -e "${YELLOW}Option B: Manual export via Dashboard${NC}"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run: SELECT * FROM your_table;"
echo "3. Export results as CSV"
echo "4. Import to local: psql -h localhost -U postgres -d postgres -c \"COPY your_table FROM '/path/to/file.csv' CSV HEADER;\""

echo ""
echo -e "${GREEN}✅ Sync complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Export data from production (see options above)"
echo "2. Import to local"
echo "3. Run: npm run dev"
