# Testing

## Frameworks

- **Vitest 4.x** — unit and integration tests
- **Playwright 1.58.x** — E2E tests

## Config

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config (Node environment) |
| `playwright.config.ts` | Playwright config |
| `global-setup.ts` | Playwright global setup |

## npm Scripts

- `npm run test:unit` — `vitest run --config vitest.config.ts`
- `npm run test:integration` — `vitest run --config vitest.config.ts --mode integration`

## File Structure

```
tests/
  .env.test                        # Test environment variables
  vitest.setup.ts                  # Vitest setup
  *.spec.ts                        # Playwright E2E tests
  *.auth.spec.ts                   # Playwright authenticated tests
  api/                             # API-level tests
  app/                             # App-level tests
  lib/                             # Lib-level unit tests
  fixtures/                        # Test fixtures
  utils/                           # Test utilities
```

## Playwright Projects

- `public` — unauthenticated tests
- `authenticated` — authenticated tests (uses `/api/test/auth` endpoint)
- `mobile-safari` — mobile Safari viewport
- `mobile-chrome` — mobile Chrome viewport

## E2E Auth

- Uses test-only endpoint at `/api/test/auth`
- Requires `TEST_API_KEY`, `TEST_USER_PASSWORD`, `TEST_USER_ID` env vars
- Auth state stored in `playwright/.auth/user.json`
- See `e2e-auth-security.md` for security rules

## CI (`.github/workflows/test.yml`)

- **Smoke tests** — Run on PR or deployment, `--grep @smoke`, `public` + `authenticated` projects
- **Nightly full** — Daily at 2 AM UTC, `--grep @full`, all projects
- Uses Cloudflare Access headers for protected environments

## Conventions

- E2E authenticated tests use `.auth.spec.ts` suffix
- Unit tests use `.test.ts` suffix
- Smoke tests tagged with `@smoke`
- Full tests tagged with `@full`
- Auth state obtained via `global-setup.ts` which hits `/api/test/auth`
