# AGENTS.md - letsboulder.com

<environment>
  DIR: /home/hadow
  STACK: Next.js 16 | React 19 | Tailwind v4 | Supabase | shadcn/ui
  GRADES: 4A-9C+ (see @docs/db/schema.md)
</environment>

<constraint>
  Prefer targeted minimal patches/search-replace style edits over broad rewrites.
  Do not output more than 10 lines of unchanged code surrounding a fix.
</constraint>

<forbidden_actions>
  - DO NOT use relative imports. ALWAYS use `@/`.
  - Prioritize Database['public']['Tables'][...] types from supabase gen types for DB rows and query surfaces; app-level mapped view models are acceptable when they improve readability.
  - DO NOT use `any`. Use `unknown` + Type Guard for non-DB payloads.
  - DO NOT commit `console.log`.
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

- NEVER skip 'supabase gen types' after schema changes; update `types/database.ts` and verify affected app types against the new schema before writing UI code.

## Build Commands

```bash
npm run dev     # Development
npm run build   # Production
npm run lint    # Lint
npm run supabase:doctor  # Verify Supabase CLI
```

## Code Style

- Imports: `@/` prefix (third-party first)
- Strings: Single quotes
- Components: PascalCase, 'use client' directive
- Files: kebab-case for non-components

## File References

- **Schema:** @docs/db/schema.md (grades, migrations, cascade logic)
- **Patterns:** @docs/patterns.md (canvas, maps, GPS, HEIC)

<next_steps>
  - Keep schema.md and patterns.md in sync with code changes
  - Prioritize Supabase-generated type migration in `types/database.ts`, `lib/submission-types.ts`, and ranking/community query surfaces.
</next_steps>
