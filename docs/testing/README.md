# Testing

## Frameworks

- **Vitest** — unit and integration tests
- **Playwright** — end-to-end tests
- **PostgreSQL/Vitest** — database integration tests against local Supabase

## Config

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config |
| `vitest.database.config.ts` | Serial database integration test config |
| `playwright.config.ts` | Playwright config |
| `global-setup.ts` | Playwright global setup |

## npm Scripts

- `npm run test:unit` — `vitest run --config vitest.config.ts`
- `npm run test:integration` — `vitest run --config vitest.config.ts --mode integration`
- `npm run test:database` — `vitest run --config vitest.database.config.ts`

## What Runs Locally

- Unit and integration tests run without privileged access.
- Database tests require local Supabase to be running with the current migrations applied, normally after a local database reset. They default to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; use `TEST_DATABASE_URL` only for another disposable test database.
- Database tests refuse non-loopback hosts. `TEST_DATABASE_ALLOW_NON_LOCAL=true` is an explicit escape hatch and must never point at shared, staging, or production data.
- Public Playwright tests can run locally with standard app/env setup.
- Authenticated Playwright tests require the test auth environment variables and the `/api/test/[segment]/auth` endpoint.
- Nightly and protected CI runs may require Cloudflare Access headers.

## File Structure

```
tests/
  .env.test                        # Test environment variables
  vitest.setup.ts                  # Vitest setup
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

## Database Tests

Run a current local Supabase database, reset it so all migrations are installed, then run `npm run test:database`. These tests use real PostgreSQL transactions and concurrent connections to exercise row/table locks, triggers, `SECURITY DEFINER` functions, grants, RLS policies, compare-and-swap behavior, and publication/deletion races; mocks are not a substitute for this suite.

## E2E Auth

- Uses test-only endpoint at `/api/test/[segment]/auth`
- Requires `TEST_API_KEY`, `TEST_USER_PASSWORD`, `TEST_USER_ID`, and `TEST_AUTH_PATH_SEGMENT` env vars
- Auth state stored in `playwright/.auth/user.json`
- See `e2e-auth-security.md` for security rules

## CI

- **Quality gates** — Run on PR/push in `.github/workflows/test.yml` and cover lint, docs drift, typecheck, build, unit, component, and integration checks
- **Smoke tests** — Run on deployment or manual dispatch in `.github/workflows/test.yml`, `--grep @smoke`, `public` + `authenticated` projects
- **Production-safe nightly** — Runs in `.github/workflows/e2e-production-nightly.yml` against `https://letsboulder.com` with `globalSetup` disabled and only anonymous public tests
- Protected non-production E2E runs use Cloudflare Access headers when required

## Conventions

- E2E authenticated tests use `.auth.spec.ts` suffix
- Unit tests use `.test.ts` suffix
- Smoke tests tagged with `@smoke`
- Full tests tagged with `@full`
- Auth state obtained via `global-setup.ts` which hits `/api/test/[segment]/auth`
