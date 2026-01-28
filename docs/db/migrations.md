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
