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
- `npm run test:e2e:production-audit` — deterministic, anonymous production-safe mobile route/state audit in Chromium and WebKit
- `npm run test:e2e:release-audit` — the production-safe matrix plus richer state/viewport and throttled-navigation release checks
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

Runtime audit specs reuse these mobile projects while explicitly setting 320, 375, 390, 430, 768, desktop-portrait, and mobile-landscape viewports. Each route/state/viewport test attaches one JSON evidence row. The audit reporter consolidates those rows in `test-results/runtime-audit-evidence.json`; detected findings fail their regression row, failures retain screenshots, video, and traces, and findings at 320–430 px also receive an issue screenshot.

## Offline Coverage

- Offline pack unit tests cover Cache API validation for unavailable, non-2xx, opaque, wrong-type, empty, and incorrect-length responses, plus persistence/removal.
- Manager tests cover resumable versus permanent failures, restart recovery, atomic failed updates, missing assets, quota rejection, partial cleanup, and concurrent operations.
- `OfflinePackDatabase` tests use a real IndexedDB implementation (`fake-indexeddb`) rather than an in-memory repository.
- Service-worker tests cover navigation, shell/static assets, every active crag media variant, cache misses, network failures, and non-packed requests.
- Playwright offline tests must cover online install, offline reload/open, interrupted download resume, failed updates, and media eviction repair across desktop Chrome, mobile Chrome, and mobile Safari-compatible projects.

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

- **Quality gates** — Run on PR/push in `.github/workflows/test.yml` and cover lint, advisory feature layout reporting, architecture boundaries, docs drift, typecheck, build, unit, and component tests
- **Generated type drift and database semantics** — A dedicated CI job starts the pinned local Supabase stack, resets it from every committed migration, runs `npm run check:type-drift`, then runs `npm run test:database` on every PR, push, and manual workflow run. This gates generated content as well as RLS, grants, triggers, locking, and RPC behavior against the reset local schema.
- **CI cost tradeoff** — Local Supabase requires Docker images and a migration reset, so this adds a few minutes and a separate Ubuntu runner. Keeping it as one isolated job avoids starting Supabase for every quality/test job while making migration changes fail closed when generated types are stale.
- **Smoke tests** — Run automatically against `https://letsboulder.com` after successful `main` production deployments and by manual dispatch in `.github/workflows/test.yml`. Manually dispatched public `--grep @smoke` tests can target production or a project-verified Vercel preview; authenticated remote smoke tests remain disabled until a protected non-production origin is available.
- **Production-safe nightly** — Runs in `.github/workflows/e2e-production-nightly.yml` against `https://letsboulder.com` with `globalSetup` disabled and only anonymous public tests; test-auth and service credentials are intentionally absent. A dedicated parallel job installs Chromium, WebKit, and their system libraries before running the deterministic mobile route matrix plus representative failure states in both engines, so failures in the legacy production-safe file list cannot suppress the audit evidence. Image-history coverage uses the maintained same-origin `IMAGE_FIRST_E2E_URL` fixture, whose public crag must retain at least two ready images.
- **Release runtime audit** — Run `PLAYWRIGHT_BASE_URL=https://letsboulder.com PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npm run test:e2e:release-audit` before UX remediation releases. It expands every WebGL, map-resource, offline, pin-request, and geolocation success/error/timeout state across every configured audit viewport and adds throttled navigation checks. Complete real-device checks on current iOS Safari and Android Chrome for software-keyboard resizing, browser chrome/safe-area clipping, page scrolling through the map, pinch/drag escape, and landscape rotation; record those observations beside the generated evidence matrix.

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

Database tests run in the local-Supabase CI job; Playwright remains separate. Deployment smoke runs use `npx playwright test --project=public --project=authenticated --grep @smoke --retries=1`; the production nightly disables global setup, runs only fixed anonymous public files plus `tests/mobile-runtime-audit.spec.ts`, and allows one retry. CI uploads unit/component test artifacts and Playwright reports, evidence matrices, screenshots, videos, and traces when available. Artifacts contain test output only and are retained for seven days.

## Conventions

- E2E authenticated tests use `.auth.spec.ts` suffix
- Unit tests use `.test.ts` suffix
- Smoke tests tagged with `@smoke`
- Full tests tagged with `@full`
- Auth state obtained via `global-setup.ts` which hits `/api/test/[segment]/auth`
