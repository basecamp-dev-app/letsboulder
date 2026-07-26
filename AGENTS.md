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

<forbidden_actions>
  - DO NOT use relative imports. ALWAYS use `@/`.
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

- NEVER skip `npx supabase gen types typescript --local > types/database.ts` after schema changes; reset local first and verify affected app types against the new schema before writing UI code.

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
npm install
npx supabase --version
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run test:database
```

Run `npm --prefix apps/media-worker run check` when database contracts used by the worker change, and `bash docs/verify.sh` when documentation or documented schema behavior changes. Only maintainers may use linked hosted-project commands; always run `npx supabase db push --linked --dry-run` and verify the project before `npx supabase db push --linked`.

## Code Style

- Imports: `@/` prefix (third-party first)
- Strings: Single quotes
- Components: PascalCase, 'use client' directive
- Files: kebab-case for non-components

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
  - Reset local and regenerate `types/database.ts` via `npx supabase gen types typescript --local > types/database.ts` after any schema change
  - Prioritize Supabase-generated type migration in `types/database.ts`, `features/submissions/lib/submission-types.ts`, and ranking/community query surfaces.
</next_steps>
