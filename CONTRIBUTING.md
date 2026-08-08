# Contributing to letsboulder.com

Thanks for helping improve letsboulder, the open-source bouldering topo and climbing logbook.

Small fixes are welcome. For larger changes, open an issue or start a discussion before implementation so the scope stays aligned.

## Branch Strategy

- Create a feature branch from `main` for each change.
- Open pull requests against `main`.
- Keep changes focused when possible; discuss larger refactors or product changes first.

## Before You Start

- Small fixes, typo corrections, and doc improvements can usually go straight to PR.
- Open an issue before larger changes, new workflows, or broad refactors.
- If a change touches public behavior, include the expected user impact in the PR description.
- If you are unsure about scope, ask first.

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
- Run `npm run typecheck` before opening a PR
- Run `npm run check:features` when changing feature boundaries
- Run `npm run check:csrf-fetch` before opening client-side API mutation changes
- Run `npm run test:unit` for unit tests that cover your change
- Run `npm run test:components` for React component changes
- Run `npm run test:integration` for integration coverage when relevant
- Install Playwright browsers with `npx playwright install chromium webkit`, then run `npx playwright test` when the change touches user flows
- Run `npm --prefix apps/media-worker run check` for Worker or media-contract changes

## Database Changes

- All schema changes go through `supabase/migrations/*.sql`
- Never edit Supabase dashboard directly
- Reset local Supabase and run `npm run test:database` for migrations, RLS, triggers, and RPC changes
- Regenerate types with `npx supabase gen types typescript --local > types/database.ts`
- Hosted pushes are maintainer-only; pushes to `main` trigger a production dry-run, while applying requires manually dispatching the `Supabase Migrations` workflow with the current `main` commit SHA. For local pushes, verify the linked project and run `npx supabase db push --linked --dry-run` first

## PR Verification Checklist

Before opening a PR, verify docs are in sync with code:

- [ ] Migration docs match the current files in `supabase/migrations/`
- [ ] Rate limit docs match `lib/rate-limit.ts`
- [ ] API route table in `docs/api/routes.md` matches `app/api/**` directories
- [ ] The change has a short summary of what changed and why
- [ ] Relevant screenshots or reproduction steps are included for UI changes
- [ ] Run `bash docs/verify.sh` (zero drift)

## Build Commands

```bash
npm run dev              # Development
npm run build            # Production
npm run lint             # Lint
npm run typecheck        # App, tests, scripts, and media contracts
npm run test:unit        # Unit tests
npm run test:components  # React component tests
npm run test:integration # Integration tests
npm run test:database    # Local Supabase database tests
bash docs/verify.sh      # Documentation drift checks
```
