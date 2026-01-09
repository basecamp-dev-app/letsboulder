# Database Sync Strategy

This document describes how to keep local development environment in sync with production Supabase.

## Overview

```
Production Supabase (Live)
         │
         │ [GitHub Actions - Daily]
         ▼
    GitHub Actions Workflow
         │
         │ [Creates artifacts]
         ▼
    db/schema/schema.sql (snapshot)
    db/data/production_data.sql (data dump)
         │
         │ [git pull]
         ▼
Local Development Environment
    (Docker PostgreSQL)
```

## Quick Start

### Daily Workflow

```bash
# 1. Pull latest changes (includes database snapshot)
git pull origin main

# 2. Sync local database with production
./db/scripts/sync-local.sh

# 3. Start development
npm run dev
```

### Full Sync (with production data)

```bash
# 1. Run GitHub Actions workflow
# Go to: https://github.com/gsyrocks/gsyrocks/actions/workflows/db-sync.yml
# Click "Run workflow" → "Full sync"

# 2. Download artifact
gh run download -n production-database-dump -D db/data

# 3. Restore to local
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres < db/data/production_data.sql

# 4. Start dev server
npm run dev
```

## File Structure

```
db/
├── migrations/              # Schema changes (version controlled)
│   ├── 000001_initial_schema.sql
│   └── 000002_add_regions.sql
├── schema/                  # Database snapshots
│   └── schema.sql          # Latest schema from production
├── data/                   # Data dumps (not in git)
│   └── production_data.sql # Latest production data
├── seed/                   # Seed data
│   └── 001_regions.sql
├── metadata/               # Database metadata
│   ├── tables.txt
│   └── indexes.txt
└── scripts/
    ├── db_snapshot.sh      # Generate schema snapshot
    ├── db_validate.sh      # Validate schema
    ├── sync-local.sh       # Sync local with production
    └── restore-from-production.md
```

## GitHub Actions Workflow

The `db-sync.yml` workflow runs automatically:

1. **Daily at 6 AM UTC** - Creates schema snapshot
2. **On demand** - Full sync with data

### Running Manually

1. Go to https://github.com/gsyrocks/gsyrocks/actions/workflows/db-sync.yml
2. Click "Run workflow"
3. Choose mode:
   - **snapshot** - Schema only (fast)
   - **full-sync** - Schema + data (slower, creates artifact)
   - **schema-only** - Quick validation

### Downloading Artifacts

```bash
# Install GitHub CLI if not installed
brew install gh  # macOS
# or
sudo apt install gh  # Linux

# Login
gh auth login

# Download latest artifact
gh run download -n production-database-dump -D db/data
```

## Local Development Setup

### Prerequisites

- Docker
- PostgreSQL client

### Starting Local Database

```bash
cd ~/supabase-local
docker compose up -d

# Verify
docker ps
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "\dt"
```

### Resetting Local Database

```bash
cd ~/supabase-local
docker compose down
docker volume rm supabase-local_pgdata
docker compose up -d

# Re-apply migrations
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/migrations/*.sql
```

## Production Safety

⚠️ **Important Safety Notes**

- **Never** run production sync commands on production
- **Always** test migrations locally first
- **Keep** production credentials in GitHub Secrets, never in code
- **Use** separate database for development

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase account token |
| `SUPABASE_PROJECT_REF` | Your Supabase project ID |

### Setting Up Secrets

1. Go to https://github.com/gsyrocks/gsyrocks/settings/secrets/actions
2. Add:
   - `SUPABASE_ACCESS_TOKEN`: From https://supabase.com/dashboard/account/tokens
   - `SUPABASE_PROJECT_REF`: From Supabase Dashboard URL

## Troubleshooting

### "Connection refused" to local database

```bash
# Check if Docker is running
docker ps

# Start Docker
sudo systemctl start docker

# Start database
cd ~/supabase-local
docker compose up -d
```

### "Permission denied" errors

```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### Migration conflicts

```bash
# Reset local database
cd ~/supabase-local
docker compose down
docker volume rm supabase-local_pgdata
docker compose up -d

# Re-apply migrations
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/migrations/*.sql
```

## Commands Reference

```bash
# Generate schema snapshot
./db/scripts/db_snapshot.sh

# Validate schema
./db/scripts/db_validate.sh

# Sync local with production
./db/scripts/sync-local.sh

# Apply migrations to local
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f db/migrations/*.sql

# Connect to local database
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres

# Connect to production (via Supabase CLI)
supabase db dump --linked
```

## Best Practices

1. **Pull before developing**: `git pull && ./db/scripts/sync-local.sh`
2. **Test migrations locally** before pushing to main
3. **Keep migrations small** and focused
4. **Document changes** in migration comments
5. **Back up** before major changes

## Support

- Supabase CLI: https://supabase.com/docs/guides/cli
- PostgreSQL: https://www.postgresql.org/docs/
- GitHub Actions: https://docs.github.com/en/actions
