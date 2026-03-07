# AGENTS.md - LetsBoulder.com

<environment>
  DIR: /home/hadow
  STACK: Next.js 16 | React 19 | Tailwind v4 | Supabase | shadcn/ui
  GRADES: 4A-9C+ (see @docs/db/schema.md)
</environment>

<constraint>
  Use 'SEARCH/REPLACE' blocks for file edits.
  Do not output more than 10 lines of unchanged code surrounding a fix.
</constraint>

<forbidden_actions>
  - DO NOT use relative imports. ALWAYS use `@/`.
  - DO NOT use `any`. Use `unknown` + Type Guard.
  - DO NOT commit `console.log`.
  - DO NOT bypass CSRF for mutations (POST/PUT/DELETE). Use `csrfFetch`.
  - DO NOT use rounded corners on mobile cards (`rounded-none` only).
  - DO NOT assume cascade delete behavior. Check @docs/db/schema.md.
</forbidden_actions>

## Build Commands

```bash
npm run dev     # Development
npm run build   # Production
npm run lint    # Lint
npm run supabase:doctor  # Verify Supabase CLI
```

## CSRF Protection

All mutations MUST use `csrfFetch` from `@hooks/useCsrf`:

```typescript
import { csrfFetch } from '@/hooks/useCsrf'

await csrfFetch('/api/endpoint', { method: 'POST', body: JSON.stringify(data) })
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
  - Review AGENTS.md every 60 days
  - Keep schema.md and patterns.md in sync with code changes
</next_steps>
