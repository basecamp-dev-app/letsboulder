# Database Migrations (Source Of Truth)

## Rule

- The canonical database schema and migration ledger are defined by `supabase/migrations/*.sql` in git.
- Any schema change must be represented as a new migration committed to the repo.
- Avoid applying schema changes manually via the Supabase dashboard SQL editor (except true emergencies). If you do, immediately capture the change as a migration and commit it.
- A migration is not considered production-safe until it has successfully run against the real hosted `letsboulder-staging` Supabase project through the same linked CLI path used for production.

## Why

- Rebuilding local should be deterministic (`npx --no-install supabase db reset`).
- Hosted staging and production should match git, not drift over time.
- Debugging is easier when schema history is visible in PRs.
- Hosted role, ownership, session, and migration-bookkeeping behavior can differ from local and CI database execution.

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

## Recommended Cleanup Workflow

Do not use production as the first hosted place to discover migration behavior. Align git and local first, then validate the complete applicable migration history against `letsboulder-staging` before considering any production apply.

Always use `--dry-run` as a preview before a hosted push, but do not treat a dry-run as evidence that the hosted migration actually succeeds. Staging must execute the real apply path.

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

## Hosted Staging Deployment

`staging` is the mandatory hosted pre-production database gate. The staging workflow should use the GitHub `Staging` environment, target only `letsboulder-staging`, and use the same hosted CLI mechanism as production:

```bash
npx --no-install supabase link \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --password "$SUPABASE_DB_PASSWORD"

npx --no-install supabase db push --linked --include-all --dry-run
npx --no-install supabase db push --linked --include-all
```

The staging workflow is expected to live at `.github/workflows/supabase-migrations-staging.yml`. It must fail on migration role, ownership, or `supabase_migrations` bookkeeping errors and run post-migration verification. It must never use production credentials, reference the production project, or modify `main`.

The first hosted staging migration should run the repository's full migration history against the new staging Supabase project. A local reset, SQL lint, database test suite, or dry-run-only workflow is not a substitute for this apply.

Required hosted migration credentials belong in the GitHub `Staging` environment, not in repository files:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_REF
```

`SUPABASE_PROJECT_REF` must identify only `letsboulder-staging`.

## Production Incident Context

Production previously encountered hosted migration failures including:

```text
must be owner of relation crags
```

and later:

```text
permission denied for schema supabase_migrations
```

These failures were not reproduced by local or CI database testing. The migration SQL executed far enough that Supabase later attempted to update its migration bookkeeping, but the active hosted database role/session no longer had permission to write to the `supabase_migrations` schema.

Production has not been declared fixed. Do not describe the incident as resolved until the equivalent migration history succeeds against `letsboulder-staging` through the hosted linked CLI path. If the role/session issue reproduces there, fix and verify it in staging before considering a production migration retry.

## Production Deployment (Maintainers Only)

Production remains isolated. `.github/workflows/supabase-migrations.yml` targets `main` and the protected Production environment. Pushes to `main` run the production validation and dry-run automatically; they never apply migrations. To apply a reviewed migration, a maintainer must manually run the **Supabase Migrations** workflow from GitHub and enter the current `main` commit SHA in `commit_sha`. The workflow rejects malformed, stale, or non-`main` SHAs, repeats the dry-run, rechecks that `main` did not move, and applies only after that check succeeds. The Production environment approval remains part of the manual apply step.

A production apply should occur only after the same migration history has successfully applied to hosted staging and passed post-migration verification.

For local maintainer operations, deliberately select the intended project, review the dry-run, and then push:

```bash
npx --no-install supabase link --project-ref <project-ref>
npx --no-install supabase db push --linked --include-all --dry-run
npx --no-install supabase db push --linked --include-all
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
npx --no-install supabase migration list --linked
```

2) If remote has versions that do not exist in git, reconstruct them into new migrations (do not delete random history in production).

### Emergency (staging/dev only): remove an invalid non-numeric version

If a non-production remote history table contains a non-numeric version (example: `20260120000000_verification_system`), Supabase CLI cannot repair it with `npx --no-install supabase migration repair`.

On staging/dev only, after verifying the target project, you can delete the one bad row:

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
npx --no-install supabase db push --linked --include-all --dry-run
npx --no-install supabase db push --linked --include-all
```

Do not use this emergency history-editing procedure against production without a separately reviewed incident plan.

For the complete environment isolation and promotion contract, see [`docs/deployment.md`](../deployment.md).
