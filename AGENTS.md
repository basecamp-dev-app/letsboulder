# AGENTS.md - letsboulder.com

<environment>
  DIR: /home/hadow
  STACK: Next.js 16 | React 19 | Tailwind v4 | Supabase | shadcn/ui
  GRADES: 3A-9C+ (see @docs/db/schema.md)
</environment>

<constraint>
  Prefer targeted minimal patches/search-replace style edits over broad rewrites.
  Do not output more than 10 lines of unchanged code surrounding a fix.
</constraint>

## Repository Map

- `app/`: Next.js route entrypoints, route-local composition, and route-local UI only.
- `features/<domain>/`: product behavior, domain UI, hooks, validation, server orchestration, and domain types.
- `components/`: shared app shell and reusable UI; `components/ui/` contains owned shadcn primitives.
- `lib/`: cross-feature technical utilities and platform integrations; do not put product-domain logic here.
- `types/`: generated database types and shared application contracts.
- `scripts/`: maintenance, export, verification, and operational tooling.
- `tests/`: Vitest unit/component/database tests and Playwright E2E tests.
- `apps/media-worker/`: independent Cloudflare Worker package with its own `package.json` and lockfile.
- `supabase/migrations/`: canonical database schema history; `types/database.ts` is generated output.
- `docs/`: subsystem contracts and operational workflows; start at `docs/README.md`.

When locating code, start with the route or feature named in the task, then follow its owning feature/server module and tests. Do not infer behavior from similarly named legacy files without checking the documented canonical caller.

<forbidden_actions>
  - Use `@/` absolute imports across application code and between features. Relative imports are allowed for files within the same small module boundary, tests, and the independent `apps/media-worker` package.
  - Prioritize Database['public']['Tables'][...] types from supabase gen types for DB rows and query surfaces; app-level mapped view models are acceptable when they improve readability.
  - DO NOT use `any`. Use `unknown` + Type Guard for non-DB payloads.
  - Use `console.log` freely during development. ESLint warns on them to remind you to clean up before merge. Allowed in test setup and script files.
  - Prefer Server Actions for app-owned UI mutations. Use Route Handlers for public API, offline/service worker, webhook, or integration flows; use `csrfFetch` only with those Route Handlers.
  - DO NOT access `window` or `document` outside of `useEffect` or 'use client'.
  - DO NOT assume cascade delete behavior. Check @docs/db/schema.md.
</forbidden_actions>

<component_governance>
  - SHADCN: We own the source in `@/components/ui`. 
  - CUSTOMIZATION: Modify UI components directly to fit the 'letsboulder' aesthetic.
  - ACCESSIBILITY: Never remove Radix primitives (e.g., `DialogTitle`) when refactoring.
  - VISUAL_LANGUAGE: Preserve the existing rounded letsboulder visual system. Do not assume a global hard-edge or zero-radius style.
</component_governance>

- NEVER skip `npx --no-install supabase gen types typescript --local > types/database.ts` after schema changes; reset local first and verify affected app types against the new schema before writing UI code.

## Build Commands

```bash
npm run dev             # Development
npm run build           # Production
npm run lint            # Lint
npm run typecheck       # App, tests, scripts, and media worker
npm run test:database   # Database tests against reset local Supabase
bash docs/verify.sh     # Documentation checks
```

## Supabase Commands

Use the lockfile-pinned CLI. The canonical schema-change workflow is local:

```bash
npm ci --prefer-offline
npm --prefix apps/media-worker ci --prefer-offline
npx --no-install supabase --version
npx --no-install supabase start
npx --no-install supabase db reset
npx --no-install supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run check:type-drift
npm run test:database
```

Run `npm --prefix apps/media-worker run check` when database contracts used by the worker change, and `bash docs/verify.sh` when documentation or documented schema behavior changes. Only maintainers may use linked hosted-project commands; always run `npx --no-install supabase db push --linked --dry-run` and verify the project before `npx --no-install supabase db push --linked`.

## Code Style

- Imports: third-party first, then `@/` absolute imports for application modules; same-directory relative imports are acceptable in tests, feature internals, and `apps/media-worker`.
- Strings: Single quotes
- Components: PascalCase, 'use client' directive
- Files: PascalCase for reusable `.tsx` components; kebab-case for utilities, hooks, actions, scripts, and other non-component files.
- Route-local files may follow the Next.js route convention (`page.tsx`, `layout.tsx`, `loading.tsx`, and similar).
- Test files use `.test.ts`/`.test.tsx`; Playwright tests use `.spec.ts`, with `.auth.spec.ts` for authenticated flows.

## Source Of Truth

- Runtime behavior is defined by code and tests; documentation describes the intended contract and must be updated when behavior changes.
- Database behavior is defined by committed migrations. Regenerate `types/database.ts` locally after schema changes; never hand-edit generated database types.
- Public route inventory is documented in `docs/api/routes.md`; route handlers remain under `app/api/**`.
- Feature layout is reported by the advisory `npm run check:features`; `npm run check:architecture` enforces ownership boundaries. See `docs/feature-structure.md` for allowed nested layouts.
- If documents disagree, prefer the committed implementation and update the stale document as part of the same change.

### File Naming Rules
- **`.tsx` component files:** PascalCase (e.g., `LogbookView.tsx`, `CragSelector.tsx`)
- **`.ts` utility/lib files:** kebab-case (e.g., `rate-limit.ts`, `submission-types.ts`)
- **Exceptions (kebab-case for `.tsx`):** Next.js route files (`page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `template.tsx`, `opengraph-image.tsx`) and shadcn/ui components in `@/components/ui`

## File References

- **Schema:** @docs/db/schema.md (grades, tables, RPCs, migrations, cascade logic)
- **Patterns:** @docs/patterns.md (canvas, maps, GPS, HEIC, media, offline)
- **Architecture:** @docs/architecture.md (system topology, data flow)
- **Media:** @docs/media-pipeline.md (upload, processing, delivery)
- **Auth:** @docs/auth-security.md (CSRF, rate limiting, auth patterns)
- **Submissions:** @docs/submission-workflow.md (draft-to-publish)
- **API:** @docs/api/routes.md (route handler reference)
- **Testing:** @docs/testing/README.md (Vitest, Playwright, CI)
- **Contributing:** @CONTRIBUTING.md (branch strategy, commit conventions)

<next_steps>
  - Keep schema.md and patterns.md in sync with code changes
  - Reset local and regenerate `types/database.ts` via `npx --no-install supabase gen types typescript --local > types/database.ts` after any schema change
  - Prioritize Supabase-generated type migration in `types/database.ts`, `features/submissions/lib/submission-types.ts`, and ranking/community query surfaces.
</next_steps>
