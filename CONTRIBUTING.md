# Contributing to letsboulder.com

Thanks for helping improve letsboulder, the open-source bouldering topo and climbing logbook.

Small fixes are welcome. For larger changes, open an issue or start a discussion before implementation so the scope stays aligned.

## Branch Strategy

- Create a feature branch for each change.
- Open pull requests against `staging` so changes pass through the persistent pre-production environment before promotion to `main`.
- `staging` is the mandatory hosted validation branch; `main` is production.
- Keep changes focused when possible; discuss larger refactors or product changes first.

See [`docs/deployment.md`](docs/deployment.md) for the full staging, hosted migration, and production promotion contract.

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

- Imports: third-party first, then `@/` absolute imports for application code. Same-directory relative imports are acceptable within feature internals, tests, and `apps/media-worker`.
- Strings: Single quotes
- Components: PascalCase, `'use client'` directive
- Files: PascalCase for reusable `.tsx` components; kebab-case for utilities, hooks, actions, scripts, and other non-component files.
- Tests use `.test.ts`/`.test.tsx`; Playwright E2E tests use `.spec.ts`, and authenticated tests use `.auth.spec.ts`.
- Never use `any` — use `unknown` + Type Guard
- Avoid committing `console.log` in app code
- Prefer Server Actions for UI mutations, Route Handlers for public API/webhooks

See `AGENTS.md` for the complete directory map, source-of-truth rules, and implementation constraints.

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

Use the smallest relevant checks during development, then run the complete quality sequence before opening a PR. The test prerequisites and CI-equivalent sequence are maintained in [`docs/testing/README.md`](docs/testing/README.md).

- Always: `npm run lint`, `npm run typecheck`, and `bash docs/verify.sh`
- Feature boundary changes: `npm run check:architecture` (and `npm run check:features` for the advisory layout report)
- Client API mutation changes: `npm run check:csrf-fetch`
- Unit or component changes: the matching Vitest script
- Database or migration changes: reset local Supabase, run `npm run check:type-drift`, and run `npm run test:database`
- Worker or media contract changes: `npm --prefix apps/media-worker run check`
- User-flow changes: install Playwright browsers and run `npm run test:e2e -- --project=<name>` for the relevant Playwright project

## Database Changes

- All schema changes go through `supabase/migrations/*.sql`.
- Never edit Supabase schema manually through the dashboard except a true reviewed emergency; capture any emergency change in git immediately.
- Reset local Supabase and run `npm run test:database` for migrations, RLS, triggers, and RPC changes.
- Regenerate types with `npx --no-install supabase gen types typescript --local > types/database.ts`.
- Local and CI checks are necessary but do not replace the hosted staging gate.
- After merge to `staging`, the migration must successfully apply to the real hosted `letsboulder-staging` project through the linked Supabase CLI path before promotion to `main`.
- Production migration apply remains maintainer-only and occurs only after hosted staging migration and post-migration verification succeed.

See [`docs/db/migrations.md`](docs/db/migrations.md) for migration details and [`docs/deployment.md`](docs/deployment.md) for the release sequence and environment isolation requirements.

## PR Verification Checklist

Before opening a PR, verify docs are in sync with code:

- [ ] Migration docs match the current files in `supabase/migrations/`
- [ ] Rate limit docs match `lib/rate-limit.ts`
- [ ] API route table in `docs/api/routes.md` matches `app/api/**` directories
- [ ] The change has a short summary of what changed and why
- [ ] Relevant screenshots or reproduction steps are included for UI changes
- [ ] Run `bash docs/verify.sh` (zero drift)

For changes intended for release, also confirm that promotion follows `feature branch -> staging -> hosted staging validation -> main`, not a direct feature-to-production path.

## Build Commands

```bash
npm run dev              # Development
npm run build            # Production
npm run lint             # Lint
npm run typecheck        # App, tests, scripts, and media contracts
npm run test:unit        # Unit tests
npm run test:components  # React component tests
npm run test:database    # Local Supabase database tests
npm run test:e2e         # Playwright E2E tests
bash docs/verify.sh      # Documentation drift checks
```

For first-time setup, use [`LOCAL_SETUP.md`](LOCAL_SETUP.md). For the full CI-equivalent command sequence, use [`docs/testing/README.md`](docs/testing/README.md) rather than duplicating it here.
