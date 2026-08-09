# Testing

## Frameworks

- **Vitest** — unit and integration tests
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
- `npm run test:integration` — `vitest run --config vitest.config.ts --mode integration`
- `npm run test:database` — `vitest run --config vitest.database.config.ts`

## What Runs Locally

- Unit and integration tests run without privileged access.
- Component tests run every `tests/**/*.test.tsx` file under jsdom with `tests/vitest.component.setup.ts`; unit/integration config handles `tests/**/*.test.ts` in Node and excludes `tests/database/**`.
- Database tests require local Supabase to be running with the current migrations applied, normally after a local database reset. They default to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; use `TEST_DATABASE_URL` only for another disposable test database.
- Database tests refuse non-loopback hosts. `TEST_DATABASE_ALLOW_NON_LOCAL=true` is an explicit escape hatch and must never point at shared, staging, or production data.
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

CI installs the lockfile exactly with `npm ci --prefer-offline`; use the same command locally when reproducing CI. The media worker is a separate package and is installed with `npm --prefix apps/media-worker ci --prefer-offline`.

Install the configured browsers once after dependencies:

```bash
npm ci --prefer-offline
npx playwright install chromium webkit
```

Local Playwright starts `npm run dev` automatically unless an existing `PLAYWRIGHT_BASE_URL` server is reused. In CI, direct URLs must be `https://dev.letsboulder.com`; a preview must be supplied by Vercel deployment ID and resolved through the Vercel API. Arbitrary URLs, query strings, credentials, ports, and paths are rejected. Run all projects with `npx playwright test`, or select projects explicitly, for example `npx playwright test --project=public --project=mobile-safari`.

## Database Tests

Install dependencies, start the lockfile-pinned local Supabase stack, and reset it so every current migration is installed before running database tests:

```bash
npm ci --prefer-offline
npx supabase start
npx supabase db reset
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

- **Quality gates** — Run on PR/push in `.github/workflows/test.yml` and cover lint, feature structure, docs drift, typecheck, build, unit, component, and integration coverage checks
- **Smoke tests** — Run on trusted deployment status or manual dispatch in `.github/workflows/test.yml`; public and authenticated `--grep @smoke` projects run in separate processes
- **Production-safe nightly** — Runs in `.github/workflows/e2e-production-nightly.yml` against `https://letsboulder.com` with `globalSetup` disabled and only anonymous public tests; test-auth and service credentials are intentionally absent
- Protected non-production E2E runs use Cloudflare Access headers when required

Run the CI-equivalent quality sequence locally with the same commands (the build requires the public Supabase environment variables):

```bash
npm ci --prefer-offline
npm run lint
npm run check:features
bash docs/verify.sh
npm run typecheck
npm run build
npm run test:unit
npm run test:components
npm run test:integration:coverage
npm --prefix apps/media-worker ci --prefer-offline
npm --prefix apps/media-worker run check
```

Database tests and Playwright are separate from the quality jobs. Deployment smoke runs use `npx playwright test --project=public --project=authenticated --grep @smoke --retries=1`; the production nightly disables global setup, runs only a fixed anonymous public file list, and allows one retry. CI uploads unit/component test artifacts and Playwright reports/traces when available. Artifacts contain test output only and are retained for seven days.

## Conventions

- E2E authenticated tests use `.auth.spec.ts` suffix
- Unit tests use `.test.ts` suffix
- Smoke tests tagged with `@smoke`
- Full tests tagged with `@full`
- Auth state obtained via `global-setup.ts` which hits `/api/test/[segment]/auth`
