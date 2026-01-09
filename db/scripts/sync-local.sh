#!/bin/bash
# Sync local development database with production Supabase
# Usage: ./scripts/sync-local.sh
#
# This script downloads the latest database dump from GitHub Actions
# and restores it to your local Docker PostgreSQL.

set -e

echo "🔄 Database Sync: Production → Local Development"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Git is available
command -v git >/dev/null 2>&1 || { echo -e "${RED}Git is required.${NC}" >&2; exit 1; }

# Check if Docker is running
if ! docker ps >/dev/null 2>&1; then
    echo -e "${YELLOW}Starting Docker...${NC}"
    sudo systemctl start docker
    sleep 3
fi

# Check if local database is running
if ! docker ps | grep -q "gsyrocks-db"; then
    echo -e "${YELLOW}Starting local database...${NC}"
    cd ~/supabase-local
    docker compose up -d
    sleep 5
fi

echo ""
echo "Step 1: Pull latest changes from git (includes database snapshot)..."
git pull origin main 2>/dev/null || echo "⚠️  Could not pull (might have local changes)"

echo ""
echo "Step 2: Check for database dumps..."
if [ -f "db/data/production_data.sql" ]; then
    echo -e "${GREEN}✓ Found production data dump${NC}"
    echo "  Size: $(du -h db/data/production_data.sql | cut -f1)"
else
    echo -e "${YELLOW}⚠️  No production data dump found${NC}"
    echo ""
    echo "Options:"
    echo "1. Run GitHub Actions workflow to generate dump"
    echo "   → Go to: https://github.com/gsyrocks/gsyrocks/actions/workflows/db-sync.yml"
    echo "   → Run 'Full sync' workflow"
    echo "   → Download artifact"
    echo ""
    echo "2. Manual export from Supabase Dashboard"
    echo "   → Go to Supabase Dashboard → SQL Editor"
    echo "   → Export tables as SQL"
fi

echo ""
echo "Step 3: To sync production data, run:"
echo ""
echo -e "${YELLOW}# Option A: Download from GitHub Actions (recommended)${NC}"
echo "gh run download -n production-database-dump -D db/data"
echo "PGPASSWORD=postgres psql -h localhost -U postgres -d postgres < db/data/production_data.sql"
echo ""
echo -e "${YELLOW}# Option B: Manual export${NC}"
echo "1. Export from Supabase Dashboard"
echo "2. Save as db/data/production_data.sql"
echo "PGPASSWORD=postgres psql -h localhost -U postgres -d postgres < db/data/production_data.sql"

echo ""
echo "Step 4: Start development server..."
echo "npm run dev"

echo ""
echo "=================================================="
echo -e "${GREEN}Done!${NC}"
