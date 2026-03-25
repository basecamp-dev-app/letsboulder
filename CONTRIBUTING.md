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

## Testing

- Run `npm run lint` before committing
- Run `npm run test:unit` for unit tests
- Run `npm run test:integration` for integration tests
- E2E tests via Playwright: `npx playwright test`

## Database Changes

- All schema changes go through `supabase/migrations/*.sql`
- Never edit Supabase dashboard directly
- Always run `--dry-run` before `db push`
- Run `supabase gen types` after schema changes to update `types/database.ts`

## Build Commands

```bash
npm run dev              # Development
npm run build            # Production
npm run lint             # Lint
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
```
