# Database Migrations (Source Of Truth)

## Rule

- The canonical database schema and migration ledger are defined by `supabase/migrations/*.sql` in git.
- Any schema change must be represented as a new migration committed to the repo.
- Avoid applying schema changes manually via the Supabase dashboard SQL editor (except true emergencies). If you do, immediately capture the change as a migration and commit it.

## Why

- Rebuilding local should be deterministic (`npx supabase db reset`).
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
- In DB but not git: reconstruct those versions into git so the repo remains the full migration ledger. If the original SQL was superseded, add a historical placeholder migration file instead of leaving CI to repair around the gap.

## Recommended Cleanup Workflow (Prod Canonical)

If prod is the most correct schema, make prod the canonical source of truth and align dev/local to it:

1. Capture any prod-only changes into `supabase/migrations` (generate a migration by diffing, or manually write the SQL).
2. Apply the resulting migrations to dev.
3. Rebuild local from migrations.

Always use `--dry-run` before pushing schema changes to a hosted Supabase project.

## Golden Path (Local Verification)

This repo assumes you run schema changes through migrations committed in git.

### 0) Tooling sanity

Use the pinned Supabase CLI and confirm it is available:

```bash
npm install
npx supabase --version
```

### 1) Create and test locally

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run test:database
```

If the schema affects worker queries/contracts or documented behavior, also run:

```bash
npm --prefix apps/media-worker run check
bash docs/verify.sh
```

Commit the migration and regenerated `types/database.ts` together.

## Hosted Deployment (Maintainers Only)

Linked commands are not part of the contributor workflow. Pushes to `main` run the production validation and dry-run automatically; they never apply migrations. To apply a reviewed migration, a maintainer must manually run the **Supabase Migrations** workflow from GitHub and enter the current `main` commit SHA in `commit_sha`. The workflow rejects stale or non-`main` SHAs, repeats the dry-run, and applies only after that check succeeds.

For local maintainer operations, deliberately select the intended project, review the dry-run, and then push:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

The GitHub workflow serializes production migration runs. Do not start a second apply while one is queued or running, and never print or paste the database password or access token into logs or issue comments.

## If `db push` Fails With "Remote migration versions not found"

This hosted-deployment troubleshooting is for maintainers operating on a deliberately linked project.

This usually means the remote migration history table (`supabase_migrations.schema_migrations`) contains versions that are not present in `supabase/migrations`.

### Common causes

- A migration was applied to the remote DB but never committed to git.
- A migration file was renamed after being applied remotely.
- The remote history table contains an invalid version (non-numeric).

### Recommended workflow

1) Inspect migration history:

```bash
npx supabase migration list --linked
```

2) If remote has versions that do not exist in git, reconstruct them into new migrations (do not delete random history in prod).

### Emergency (dev only): remove an invalid non-numeric version

If the remote history table contains a non-numeric version (example: `20260120000000_verification_system`), Supabase CLI cannot repair it with `npx supabase migration repair`.

In dev, you can delete the one bad row:

```bash
npx supabase db dump --dry-run --schema supabase_migrations
```

Use the printed `PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD` env vars and run:

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -c "delete from supabase_migrations.schema_migrations where version = '20260120000000_verification_system';"
```

Then re-run:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```
