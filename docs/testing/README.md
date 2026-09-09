# Testing

## Frameworks

- **Vitest** — unit tests
- **Vitest + Testing Library/jsdom** — component and hook tests (`*.test.tsx`)
- **Playwright** — end-to-end tests
- **PostgreSQL/Vitest** — database integration tests against local Supabase

## Config

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config |
| `vitest.component.config.ts` | jsdom component-test config |
| `vitest.database.config.ts` | Serial database integration test config |
| `playwright.config.ts` | Playwright config |
| `global-setup.ts` | Playwright global setup |

## npm Scripts

- `npm run test:unit` — `vitest run --config vitest.config.ts`
- `npm run test:components` — `vitest run --config vitest.component.config.ts`
- `npm run test:e2e` — `playwright test` (append Playwright options after `--`)
- `npm run test:e2e:offline` — mandatory local Chromium reliability harness with its repository-owned fixture and web server
- `npm run test:database` — `vitest run --config vitest.database.config.ts`
- `npm run check:type-drift` — generate types from local Supabase and compare them with `types/database.ts` without modifying the tracked file

## What Runs Locally

- Unit tests run without privileged access.
- Component tests run every `tests/**/*.test.tsx` file under jsdom with `tests/vitest.component.setup.ts`; the unit config handles `tests/**/*.test.ts` in Node and excludes `tests/database/**`.
- Database tests require local Supabase to be running with the current migrations applied, normally after a local database reset. The shared database-test harness defaults to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; use `TEST_DATABASE_URL` only for another disposable test database.
- Database tests refuse non-loopback hosts. `TEST_DATABASE_ALLOW_NON_LOCAL=true` is an explicit escape hatch and must never point at shared, staging, or production data.
- `npm run check:type-drift` has the same local Supabase prerequisite as database tests. It fails when the committed generated types do not match the running local schema. A missing or unavailable local Supabase instance is also a failure, rather than a skipped check.
- `immutable-wiki-revisions.test.ts` verifies baseline capture, grouped entity commits, parent chains, RFC 6902 patches, hashes, database immutability, account anonymization, rollback lineage, and stale-head conflicts.
- Public Playwright tests can run locally with standard app/env setup.
- Authenticated Playwright tests require the test auth environment variables and the `/api/test/[segment]/auth` endpoint.
- Nightly and protected CI runs may require Cloudflare Access headers.

## File Structure

```
tests/
  .env.test                        # Test environment variables
  vitest.setup.ts                  # Vitest setup
  vitest.component.setup.ts        # Testing Library/jsdom setup
  *.spec.ts                        # Playwright E2E tests
  *.auth.spec.ts                   # Playwright authenticated tests
  api/                             # API-level tests
  app/                             # App-level tests
  database/                        # Real PostgreSQL migration and concurrency tests
  lib/                             # Lib-level unit tests
  fixtures/                        # Test fixtures
  utils/                           # Test utilities
```

## Playwright Projects

- `public` — unauthenticated tests
- `authenticated` — authenticated tests (uses `/api/test/[segment]/auth` endpoint)
- `mobile-safari` — mobile Safari viewport
- `mobile-chrome` — mobile Chrome viewport

## Offline Coverage

- Offline pack unit tests cover Cache API validation for unavailable, non-2xx, opaque, wrong-type, empty, exact-length, and SHA-256 mismatch responses, plus local byte revalidation and persistence/removal.
- Manager and IndexedDB tests cover exact integrity checkpoints, retained predecessors, shared ownership, migration lifecycle, restart recovery, incompatible readers, atomic failed updates, missing assets, quota rejection, and digest-validating repair.
- `OfflinePackDatabase` tests use a real IndexedDB implementation (`fake-indexeddb`) rather than an in-memory repository.
- Service-worker tests cover navigation, shell/static assets, every active crag media variant, cache misses, network failures, and non-packed requests.
- `npm run test:e2e:offline` is mandatory and uses Signal Lost Cove, a repository-owned public fixture with three climbs, two sectors, two topo faces, shared-image relationships, a text-only climb, access and tide notes, and coordinates. It requires no hosted fixture, credential, secret, optional URL, or caller-supplied fixture environment variable.
- The suite covers Pack v2 Verified state, exact fixture byte/digest checkpoints, digest and byte-count rejection, missing metadata/media, quota rejection, incompatible/failed update preservation, online install, airplane-mode reload, cache-first navigation, page/process restart, auth-state changes, and service-worker restart.
- Playwright's browser projects are automated browser coverage only. Installed-PWA release validation must follow the [physical-device checklist](offline-device-release-checklist.md) on current supported iOS and Android hardware.

CI installs the lockfile exactly with `npm ci --prefer-offline`; use the same command locally when reproducing CI. The media worker is a separate package and is installed with `npm --prefix apps/media-worker ci --prefer-offline`.

Install the configured browsers once after dependencies:

```bash
npm ci --prefer-offline
npx playwright install chromium webkit
```

Local Playwright starts `npm run dev` automatically unless an existing `PLAYWRIGHT_BASE_URL` server is reused. In CI, the only direct URL is `https://letsboulder.com`, and it is restricted to public tests. A preview must be supplied by Vercel deployment ID and resolved through the Vercel API. Arbitrary URLs, query strings, credentials, ports, and paths are rejected. Run all projects with `npx playwright test`, or select projects explicitly, for example `npx playwright test --project=public --project=mobile-safari`.

## Database Tests

Install dependencies, start the lockfile-pinned local Supabase stack, and reset it so every current migration is installed before running database tests:

```bash
npm ci --prefer-offline
npx --no-install supabase start
npx --no-install supabase db reset
npm run test:database
```

The default connection is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. These serial tests use real PostgreSQL transactions and concurrent connections to exercise locks, triggers, `SECURITY DEFINER` functions, grants, RLS, compare-and-swap behavior, and publication/deletion races; mocks are not a substitute. `TEST_DATABASE_URL` may target another disposable loopback database. Non-loopback access requires `TEST_DATABASE_ALLOW_NON_LOCAL=true` and must never target shared, staging, or production data.

## E2E Auth

- Uses test-only endpoint at `/api/test/[segment]/auth`
- Requires `TEST_API_KEY`, `TEST_USER_PASSWORD`, `TEST_AUTH_PATH_SEGMENT`, and either `TEST_USER_EMAIL` or `TEST_USER_ID`
- The app server must receive `ENABLE_TEST_AUTH_ENDPOINT=true`; the proxy always returns 404 for this endpoint in production
- Auth state stored in `playwright/.auth/user.json`
- See `e2e-auth-security.md` for security rules

## CI

- **Staging gates** — Pull requests into `staging` run the normal CI jobs in `.github/workflows/test.yml` plus the separate dependency audit. After a change is merged, `.github/workflows/supabase-migrations-staging.yml` validates the exact current `staging` SHA and the isolated hosted staging Supabase target, applies and verifies migrations, compares generated types, and only then triggers the staging Vercel hook. A failed hosted-staging gate prevents staging deployment.
- **Quality gates** — `.github/workflows/test.yml` covers lint, advisory feature layout reporting, architecture boundaries, docs drift, typecheck, build, unit, component, generated database type drift/database semantics, mandatory Offline Reliability, and media-worker checks. The release workflow treats Offline Reliability as mandatory even though it is not part of the repository's current `main` ruleset status-check list.
- **Generated type drift and database semantics** — A dedicated CI job starts the pinned local Supabase stack, resets it from every committed migration, runs `npm run check:type-drift`, then runs `npm run test:database` on every PR, push, and manual workflow run. This gates generated content as well as RLS, grants, triggers, locking, and RPC behavior against the reset local schema.
- **Offline reliability** — A dedicated CI job runs `npm run test:e2e:offline` in Chromium. It has no Supabase, CDN, authentication, hosted-fixture, secret, or optional fixture configuration dependency. A failure blocks production release automation; it is not advisory.
- **Production release gates** — A `staging → main` promotion runs both `CI` and `Security audits` on the resulting `main` SHA. When `CI` completes successfully, the **Production Release** workflow starts from that exact SHA and independently verifies it is still current `main`, is associated with a merged `staging → main` PR, and has successful `Quality Checks`, `Generated Database Type Drift`, `Next.js Build`, `Unit Tests`, `Component Tests`, `Offline Reliability`, `Media Worker Check`, and `Dependency audits` check runs. Missing, pending, cancelled, timed-out, or failed mandatory checks prevent deployment.
- **Code-only production release** — After the release checks pass, Production Release validates the protected production Supabase target and runs `supabase db push --linked --include-all --dry-run`. If the remote migration history is already current, the workflow rechecks the exact `main` SHA and triggers the production Vercel deploy hook automatically. No production application deploy occurs from arbitrary branches or direct feature PRs to `main`.
- **Migration-bearing production release** — If the automatic dry-run finds pending or unverified migrations, the run fails closed before Vercel. A maintainer manually dispatches the same **Production Release** workflow with the current full `main` SHA. That path repeats the release checks and dry-run, rechecks `main`, applies migrations, proves migration bookkeeping is complete, verifies the production governance schema/roles, rechecks `main` again, and only then triggers the one production Vercel hook. The protected `Production` GitHub environment remains the source of production credentials and approvals.
- **Post-deploy smoke tests** — Vercel's successful Production deployment for `main` emits `deployment_status`; the `smoke` job in `.github/workflows/test.yml` then runs against `https://letsboulder.com`. This event-driven smoke path is downstream of the production deploy hook, not a release gate that can be used to authorize the deploy. Manually dispatched migration releases additionally run the production application database-read smoke and public Playwright smoke inside Production Release.
- **Failure behavior after merge** — A `main` merge does not imply that production is releasable. If any mandatory CI/security check fails after merge, Production Release does not call Vercel. Fix or rerun the failing check while the same commit remains current `main`, or promote a corrected staging commit; do not downgrade a mandatory check to advisory to force a release.
- **CI cost tradeoff** — Local Supabase requires Docker images and a migration reset, so this adds a few minutes and a separate Ubuntu runner. Keeping it as one isolated job avoids starting Supabase for every quality/test job while making migration changes fail closed when generated types are stale.
- **Production-safe nightly** — Runs in `.github/workflows/e2e-production-nightly.yml` against `https://letsboulder.com` with `globalSetup` disabled and only anonymous public tests; test-auth and service credentials are intentionally absent. Image-history coverage uses the maintained same-origin `IMAGE_FIRST_E2E_URL` fixture, whose public crag must retain at least two ready images.

Run the CI-equivalent quality sequence locally with the same commands (the build requires the public Supabase environment variables). Changes to feature-layout tooling should also run `npm run lint:features`; it is advisory and reports at most one layout warning per feature.

```bash
npm ci --prefer-offline
npm --prefix apps/media-worker ci --prefer-offline
npm run lint
npm run check:features
npm run check:architecture
bash docs/verify.sh
npm run typecheck
npx --no-install supabase start
npx --no-install supabase db reset
npm run check:type-drift
npm run test:database
npm run build
npm run test:unit
npm run test:components
npm --prefix apps/media-worker run check
```

Database tests run in the local-Supabase CI job; Playwright remains separate. Deployment smoke runs use `npx playwright test --project=public --project=authenticated --grep @smoke --retries=1`; the production nightly disables global setup, runs only a fixed anonymous public file list, and allows one retry. CI uploads unit/component test artifacts and Playwright reports/traces when available. Artifacts contain test output only and are retained for seven days.

## Conventions

- E2E authenticated tests use `.auth.spec.ts` suffix
- Unit tests use `.test.ts` suffix
- Smoke tests tagged with `@smoke`
- Full tests tagged with `@full`
- Auth state obtained via `global-setup.ts` which hits `/api/test/[segment]/auth`
