# Database Migrations (Source Of Truth)

## Rule

- The canonical database schema and migration ledger are defined by `supabase/migrations/*.sql` in git.
- Any schema change must be represented as a new migration committed to the repo.
- Avoid applying schema changes manually via the Supabase dashboard SQL editor (except true emergencies). If you do, immediately capture the change as a migration and commit it.

## Why

- Rebuilding local should be deterministic (`npx --no-install supabase db reset`).
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

Always use `--dry-run` before pushing schema changes to a hosted Supabase project. A dry-run is a preview only and must not be treated as evidence that an apply occurred.

## Golden Path (Local Verification)

This repo assumes you run schema changes through migrations committed in git.

### 0) Tooling sanity

Use the pinned Supabase CLI and confirm it is available:

```bash
npm ci --prefer-offline
npm --prefix apps/media-worker ci --prefer-offline
npx --no-install supabase --version
```

### 1) Create and test locally

```bash
npx --no-install supabase start
npx --no-install supabase db reset
npx --no-install supabase gen types typescript --local > types/database.ts
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

Linked commands are not part of the contributor workflow. Production application release authority lives in the **Production Release** workflow (`.github/workflows/supabase-migrations.yml`). A verified `staging → main` promotion must first pass the mandatory release checks for the exact current `main` SHA. Production Release validates the protected production Supabase target and runs `npx --no-install supabase db push --linked --include-all --dry-run` before any application deployment.

For a code-only release, the automatic run proves that the hosted migration history is already current, rechecks that the selected commit is still current `main`, and then triggers the production Vercel hook. No maintainer needs to start a separate migration workflow for that release.

If the dry-run reports pending or otherwise unverified production migrations, the automatic run stops before Vercel and does not apply anything. A maintainer must manually dispatch **Production Release** and enter the exact current `main` commit SHA in `commit_sha`. The protected workflow rejects malformed, stale, non-`main`, or non-`staging → main` release commits; repeats the mandatory release checks and production target validation; repeats the dry-run; rechecks `main`; applies the pending migrations; proves migration bookkeeping is complete; verifies the production governance schema and roles; rechecks `main` again; and only then triggers the same production Vercel deploy hook. The `Production` GitHub environment remains the credential and approval boundary for both code-only release validation/deployment and migration application.

The workflow serializes production releases with one concurrency group, and the repository has only one production Vercel hook trigger. Do not start a competing production apply/deploy path. After Vercel reports a successful Production deployment for `main`, the existing `deployment_status` CI path runs the production browser smoke tests; manually dispatched migration releases also run the database-read and public Playwright smoke checks in the release workflow.

For local maintainer operations, deliberately select the intended project, review the dry-run, and then push:

```bash
npx --no-install supabase link --project-ref <project-ref>
npx --no-install supabase db push --linked --dry-run
npx --no-install supabase db push --linked
```

Do not start a second production migration apply while one is queued or running, and never print or paste the database password or access token into logs or issue comments.

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
npx --no-install supabase migration list --linked
```

2) If remote has versions that do not exist in git, reconstruct them into new migrations (do not delete random history in prod).

### Emergency (dev only): remove an invalid non-numeric version

If the remote history table contains a non-numeric version (example: `20260120000000_verification_system`), Supabase CLI cannot repair it with `npx --no-install supabase migration repair`.

In dev, you can delete the one bad row:

```bash
npx --no-install supabase db dump --dry-run --schema supabase_migrations
```

Use the printed `PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD` env vars and run:

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -c "delete from supabase_migrations.schema_migrations where version = '20260120000000_verification_system';"
```

Then re-run:

```bash
npx --no-install supabase db push --linked --dry-run
npx --no-install supabase db push --linked
```
