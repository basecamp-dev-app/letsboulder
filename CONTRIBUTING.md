# Contributing to letsboulder.com

Thanks for helping improve letsboulder, the open-source bouldering topo and climbing logbook.

Small fixes are welcome. For larger changes, open an issue or start a discussion before implementation so the scope stays aligned.

## Branch Strategy

- Create a feature branch from `main` for each change.
- Open pull requests against `main`.
- Keep changes focused when possible; discuss larger refactors or product changes first.

## Commit Conventions

This project uses conventional commits when practical:

- `feat:` — new features
- `fix:` — bug fixes
- `refactor:` — code refactoring
- `chore:` — maintenance tasks
- `debug:` — temporary debugging additions

## Code Style

- Imports: `@/` prefix (third-party first)
- Strings: Single quotes
- Components: PascalCase, `'use client'` directive
- Files: kebab-case for non-components
- Never use `any` — use `unknown` + Type Guard
- Avoid committing `console.log` in app code
- Prefer Server Actions for UI mutations, Route Handlers for public API/webhooks

## Logging

- **Request-path code** (`app/api/**`, `lib/`, `features/**/server/**`): use `reportError` from `@/lib/errors` for warnings and errors. Never use `console.*` directly.
- **Workers** (`workers/**`, `apps/**`): `console.*` is allowed for operational logging (job lifecycle, failures, startup).
- **Scripts** (`scripts/**`): `console.*` is allowed for CLI output and progress reporting.
- **Test setup** (`global-setup.ts`, `global-teardown.ts`): `console.*` is allowed for bootstrap diagnostics.
- **`lib/errors.ts`**: the `console.error` inside `reportError` is the intentional non-production fallback and should not be removed.

## Module Boundaries

- Use `app/` for route entrypoints, route-local wrappers, and route-level composition only.
- Put new product-domain code under `features/<domain>/`.
- Keep root `components/` for shared UI, app shell, and `components/ui/` primitives.
- Keep root `lib/` for cross-feature technical utilities, not feature-owned business logic.
- Do not import from `@/app/**` outside route files. If code needs to be reused, move it into `features/**`, `lib/**`, or another shared layer first.

## Testing

- Run `npm run lint` before opening a PR
- Run `npm run check:csrf-fetch` before opening client-side API mutation changes
- Run `npm run test:unit` for unit tests that cover your change
- Run `npm run test:integration` for integration coverage when relevant
- Run Playwright E2E tests with `npx playwright test` when the change touches user flows

## Database Changes

- All schema changes go through `supabase/migrations/*.sql`
- Never edit Supabase dashboard directly
- Always run `--dry-run` before `db push`
- Run `supabase gen types` after schema changes to update `types/database.ts`

## PR Verification Checklist

Before opening a PR, verify docs are in sync with code:

- [ ] Migration docs match the current files in `supabase/migrations/`
- [ ] Rate limit docs match `lib/rate-limit.ts`
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
