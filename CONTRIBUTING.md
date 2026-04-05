# Contributing to letsboulder.com

Solo-developer project — bouldering topo and climbing logbook.

## Branch Strategy

- `dev` — working and staging branch, all day-to-day development
- `main` — production branch, auto-deploys to letsboulder.com
- Merge `dev` → `main` for production releases
- Merge `main` → `dev` after each release to keep branches aligned

## Commit Conventions

This project uses conventional commits:

- `feat:` — new features
- `fix:` — bug fixes
- `refactor:` — code refactoring
- `chore:` — maintenance tasks
- `debug:` — debugging additions (should be temporary)

## Code Style

- Imports: `@/` prefix (third-party first)
- Strings: Single quotes
- Components: PascalCase, `'use client'` directive
- Files: kebab-case for non-components
- Never use `any` — use `unknown` + Type Guard
- Never commit `console.log`
- Prefer Server Actions for UI mutations, Route Handlers for public API/webhooks

## Logging

- **Request-path code** (`app/api/**`, `lib/`, `features/**/server/**`): use `reportError` from `@/lib/errors` for warnings and errors. Never use `console.*` directly.
- **Workers** (`workers/**`, `apps/**`): `console.*` is allowed for operational logging (job lifecycle, failures, startup).
- **Scripts** (`scripts/**`): `console.*` is allowed for CLI output and progress reporting.
- **Test setup** (`global-setup.ts`, `global-teardown.ts`): `console.*` is allowed for bootstrap diagnostics.
- **`lib/errors.ts`**: the `console.error` inside `reportError` is the intentional non-production fallback and should not be removed.

## Module Boundaries

- Use `app/` for route entrypoints and route-local wrappers only.
- Put new product-domain code under `features/<domain>/`.
- Keep root `components/` for shared UI, app shell, and `components/ui/` primitives.
- Keep root `lib/` for cross-feature technical utilities, not feature-owned business logic.
- Do not import from `@/app/**` outside route files. If code needs to be reused, move it into `features/**`, `lib/**`, or another shared layer first.

## Testing

- Run `npm run lint` before committing
- Run `npm run check:csrf-fetch` before committing client-side API mutations
- Run `npm run test:unit` for unit tests
- Run `npm run test:integration` for integration tests
- E2E tests via Playwright: `npx playwright test`

## Database Changes

- All schema changes go through `supabase/migrations/*.sql`
- Never edit Supabase dashboard directly
- Always run `--dry-run` before `db push`
- Run `supabase gen types` after schema changes to update `types/database.ts`

## PR Verification Checklist

Before opening a PR, verify docs are in sync with code:

- [ ] Migration count matches `ls supabase/migrations | wc -l`
- [ ] Rate limit tier count matches `lib/rate-limit-config.ts`
- [ ] API route table in `docs/api/routes.md` matches `app/api/**` directories
- [ ] Run `bash docs/verify.sh` (zero drift)

## Build Commands

```bash
npm run dev              # Development
npm run build            # Production
npm run lint             # Lint
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
```
