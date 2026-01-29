# Database Migrations (Source Of Truth)

## Rule

- The canonical database schema is defined by `supabase/migrations/*.sql` in git.
- Any schema change must be represented as a new migration committed to the repo.
- Avoid applying schema changes manually via the Supabase dashboard SQL editor (except true emergencies). If you do, immediately capture the change as a migration and commit it.

## Why

- Rebuilding local should be deterministic (`supabase migration up` / `supabase db reset`).
- Dev/prod should match git, not drift over time.
- Debugging is easier when schema history is visible in PRs.

## Common Drift Patterns

- DB has versions that do not exist in git: migrations were applied somewhere but never committed.
- Git has migrations that are not applied to a DB: the DB is simply behind.
- Schema differs even though versions match: manual SQL changes, or migrations were edited after being applied.

## Audit: Compare Git vs A Database

Supabase tracks applied migration versions in `supabase_migrations.schema_migrations`.

1. Get DB applied versions:

```bash
psql "$DATABASE_URL" -Atc "select version from supabase_migrations.schema_migrations order by version;"
```

2. Get git versions:

```bash
ls supabase/migrations | sed -n 's/\(^[0-9]\{14\}\).*/\1/p' | sort
```

3. Differences:

- In git but not DB: apply migrations.
- In DB but not git: reconstruct those changes into new migration files.

## Recommended Cleanup Workflow (Prod Canonical)

If prod is the most correct schema, make prod the canonical source of truth and align dev/local to it:

1. Capture any prod-only changes into `supabase/migrations` (generate a migration by diffing, or manually write the SQL).
2. Apply the resulting migrations to dev.
3. Rebuild local from migrations.

Always use `--dry-run` before pushing schema changes to a hosted Supabase project.

## Golden Path (Local -> Dev -> Prod)

This repo assumes you run schema changes through migrations committed in git.

### 0) Tooling sanity

Use the pinned Supabase CLI (via npm) and confirm you're not accidentally using multiple CLIs:

```bash
npm install
npm run supabase:doctor
```

### 1) Create and test locally

```bash
supabase start
npm run db:local:up
```

### 2) Deploy schema to dev

```bash
npm run db:push:dev:dry
npm run db:push:dev
```

### 3) Deploy schema to prod

```bash
npm run db:push:prod:dry
npm run db:push:prod
```

## If `db push` Fails With "Remote migration versions not found"

This usually means the remote migration history table (`supabase_migrations.schema_migrations`) contains versions that are not present in `supabase/migrations`.

### Common causes

- A migration was applied to the remote DB but never committed to git.
- A migration file was renamed after being applied remotely.
- The remote history table contains an invalid version (non-numeric).

### Recommended workflow

1) Inspect migration history:

```bash
npm run db:migrations:list:linked
```

2) If remote has versions that do not exist in git, reconstruct them into new migrations (do not delete random history in prod).

### Emergency (dev only): remove an invalid non-numeric version

If the remote history table contains a non-numeric version (example: `20260120000000_verification_system`), Supabase CLI cannot repair it with `supabase migration repair`.

In dev, you can delete the one bad row:

```bash
supabase db dump --dry-run --schema supabase_migrations
```

Use the printed `PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD` env vars and run:

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -c "delete from supabase_migrations.schema_migrations where version = '20260120000000_verification_system';"
```

Then re-run:

```bash
npm run db:push:dev:dry
npm run db:push:dev
```
