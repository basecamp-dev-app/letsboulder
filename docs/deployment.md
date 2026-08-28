# Deployment And Release Workflow

This document is the operational source of truth for deployed environment isolation, staging validation, and promotion to production.

## Environment Model

letsboulder uses one GitHub repository and one Vercel project with branch-based environment isolation:

- Repository: `basecamp-dev-app/letsboulder`
- `main` = production
- `staging` = persistent pre-production
- Vercel:
  - `main` -> Production
  - `staging` -> Pre-Production/Staging
- Supabase:
  - existing production project
  - `letsboulder-staging`
- Cloudflare media infrastructure is separate for staging and production.

Staging resources are:

```text
App:
https://staging.letsboulder.com

Media:
https://static.staging.letsboulder.com

Cloudflare Worker:
media-worker-staging

R2:
lb-staging-media-private
lb-staging-media-public

Queue:
media-transform-queue-staging
```

Production infrastructure must remain isolated and unchanged while staging work is being developed or validated.

## Operational Contract

`staging` is not a disposable preview branch. It is the mandatory hosted pre-production validation environment for infrastructure, Supabase migrations, application deployment, and smoke testing before promotion to `main`.

The critical release gate is:

> A migration must successfully run against the real hosted staging Supabase project before it is considered safe for production.

The intended release path is:

```text
feature branch
    ↓
CI/local checks
    ↓
merge to staging
    ↓
REAL hosted staging Supabase migration
    ↓
post-migration DB verification
    ↓
staging Vercel deployment
    ↓
staging application smoke tests
    ↓
promote staging → main
    ↓
production Supabase migration
    ↓
production verification
    ↓
production Vercel deployment
```

Do not bypass the hosted staging migration gate with only local database tests, SQL linting, or a dry-run-only CI check.

## Staging Media Worker

The staging media Worker deployment is fully operational and isolated from the production Worker and production Cloudflare resources.

Workflow:

```text
.github/workflows/media-worker-staging-deploy.yml
```

It runs on pushes to `staging` when the Worker or workflow changes and uses the GitHub environment:

```text
Staging
```

The workflow performs:

1. dependency installation
2. Worker typechecking
3. staging secret validation
4. staging R2/Queue resource verification
5. Worker binding reconciliation
6. Worker secret upload
7. staging Worker deployment
8. staging HTTP smoke testing

The deployed Worker is:

```text
media-worker-staging
```

with custom domain:

```text
static.staging.letsboulder.com
```

### Smoke Test Contract

PR #129, `Fix staging media worker smoke test`, was merged into `staging` at commit:

```text
8034502188e97962f1383163d5de805b0741dc35
```

The previous smoke test requested the Worker root:

```text
GET https://static.staging.letsboulder.com/
```

The Worker has no valid root endpoint, so a healthy deployment returned `404`.

The workflow now tests the protected `/enqueue` route without credentials:

```bash
status="$(
  curl \
    --silent \
    --show-error \
    --retry 12 \
    --retry-all-errors \
    --retry-delay 5 \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    https://static.staging.letsboulder.com/enqueue
)"

if [ "$status" != "401" ]; then
  echo "::error::Expected 401 from staging media worker, got $status"
  exit 1
fi

echo "Staging media worker is reachable and ingress auth is enforced."
```

The Worker checks `Authorization` before processing the request and returns `401 Unauthorized` when the ingress secret is absent or invalid. This verifies DNS, TLS, Cloudflare Custom Domain routing, Worker execution, `/enqueue` route availability, and ingress authentication enforcement without creating a media job.

The automatically triggered `Media Worker Deploy (Staging)` workflow succeeded after PR #129 was merged.

## GitHub `Staging` Environment

The staging Worker already uses these GitHub environment secrets:

```text
CLOUDFLARE_API_TOKEN
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INGRESS_SECRET
INTERNAL_ORIGIN_SECRET
```

Existing environment variable:

```text
CLOUDFLARE_ACCOUNT_ID
```

Never commit or document actual secret values.

The hosted staging Supabase migration workflow additionally requires the credentials used by the Supabase CLI hosted migration path:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_REF
```

`SUPABASE_PROJECT_REF` must refer only to `letsboulder-staging`. Keep these values in the GitHub `Staging` environment, not in repository files.

## Hosted Staging Supabase Migrations

Production currently uses `.github/workflows/supabase-migrations.yml` and links to a hosted project with:

```bash
supabase link \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --password "$SUPABASE_DB_PASSWORD"
```

It validates with:

```bash
supabase db push --linked --include-all --dry-run
```

and the explicit production apply path uses:

```bash
supabase db push --linked --include-all
```

Staging must deliberately exercise this same real hosted Supabase mechanism. The purpose of staging is to reproduce the hosted role, ownership, session, and migration bookkeeping behavior that production uses.

### Why Hosted Staging Is Required

Production previously encountered hosted Supabase failures including:

```text
must be owner of relation crags
```

and later:

```text
permission denied for schema supabase_migrations
```

These failures exposed behavior that local and CI database testing did not reproduce. Migration SQL was able to execute far enough that Supabase later attempted to update its migration bookkeeping, but the active hosted database role/session no longer had permission to write to the `supabase_migrations` schema.

Production has not been declared fixed. Do not document or treat the migration problem as resolved until the equivalent migration history succeeds against `letsboulder-staging` through the hosted CLI path.

## Next Workflow To Implement

The next infrastructure implementation should be a staging-only hosted migration workflow, for example:

```text
.github/workflows/supabase-migrations-staging.yml
```

It should:

- trigger for relevant changes on `staging`
- use `environment: Staging`
- target only `letsboulder-staging`
- use the same `supabase link` mechanism as production
- execute `supabase db push --linked --include-all`
- fail hard on migration role, ownership, or bookkeeping errors
- run post-migration verification
- never reference production credentials or the production project
- never modify `main`

The first hosted staging migration should run the repository's full migration history against the new staging Supabase project. If the previous role/session issue still exists, reproduce and fix it in staging before considering any production migration retry.

## Security And Isolation Requirements

Do not modify or repurpose production resources while implementing or validating staging:

```text
main
production Supabase
production Vercel environment
media-worker-production
production R2 buckets
production Cloudflare Queue
production Worker routes
```

Never expose secrets such as:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD
SUPABASE_ACCESS_TOKEN
INGRESS_SECRET
INTERNAL_ORIGIN_SECRET
R2_SECRET_ACCESS_KEY
```

Do not copy production user data into staging. Use synthetic/test data only.

Do not create another GitHub repository or another Vercel project. Continue using the existing repository and Vercel project with branch-based environment isolation.
