# AGENTS.md

This document provides guidelines for agents working on this codebase.

## Build, Lint, and Test Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Lint specific files or directories
npx eslint app/components/MyComponent.tsx
npx eslint app/api/

# Fix auto-fixable lint errors
npm run lint -- --fix
```

## Database Source Of Truth

- Schema changes must be captured as committed migrations in `supabase/migrations`.
- Avoid manual schema edits in the Supabase dashboard; if unavoidable, immediately backfill into a migration.
- See `docs/db/migrations.md` for drift-audit and cleanup workflow.

### Recommended Commands (Golden Path)

```bash
# Ensure pinned Supabase CLI is used
npm install
npm run supabase:doctor

# Local
supabase start
npm run db:local:up

# Dev
npm run db:push:dev:dry
npm run db:push:dev

# Prod
npm run db:push:prod:dry
npm run db:push:prod
```

**Note:** This project does not currently have a test suite. When adding tests, use:
- Vitest for unit/integration tests
- Playwright for E2E tests
- Run a single test file: `npx vitest run path/to/test.spec.ts`

## Code Style Guidelines

### Imports
- Use absolute imports with `@/` prefix (configured in `tsconfig.json`)
- Group third-party imports before local imports
- Single quotes for all strings

```typescript
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
```

### TypeScript
- Enable strict mode (`"strict": true` in `tsconfig.json`)
- Avoid `any` type; use specific types or `unknown` with proper type guards
- Use interface for object types, type for unions/primitives
- Export types at the bottom or alongside their primary usage

```typescript
interface User {
  id: string
  email: string
  created_at: string
}

async function getUser(): Promise<User | null> { /* implementation */ }
```

### React Components
- Use `'use client'` directive at the top of client components
- Default export for page and component files
- Functional components with hooks (useState, useEffect, etc.)
- Prop typing: explicit interfaces for component props
- Use `next/dynamic` with `ssr: false` for Leaflet maps and canvas components

```typescript
'use client'
import { useState } from 'react'
import nextDynamic from 'next/dynamic'

const RouteCanvas = dynamic(() => import('./components/RouteCanvas'), { ssr: false })

interface UploadFormProps { onUploadComplete?: (url: string) => void }

export default function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [uploading, setUploading] = useState(false)
  // ...
}
```

### Naming Conventions
- **Components**: PascalCase (e.g., `UploadForm`, `RouteCanvas`)
- **Variables/functions**: camelCase (e.g., `handleUpload`, `getUser`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Files**: kebab-case for non-component files (e.g., `extract-gps`, `test-db`)
- **API Routes**: kebab-case with descriptive names in `app/api/[route]/route.ts`

### Error Handling
- API routes: Try-catch with proper error logging and NextResponse.json errors
- Client components: Error state with useState, display user-friendly messages
- Never expose sensitive error details to clients

```typescript
export async function POST(request: NextRequest) {
  try { /* implementation */ } catch (error) {
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
```

### API Routes
- Use `NextRequest` and `NextResponse` from `next/server`
- Validate inputs early, return 400 for invalid data
- Return JSON responses with appropriate status codes
- Use `createServerClient` for Supabase in API routes
- Use `withCsrfProtection` for state-changing operations (POST, PUT, DELETE)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'

export async function PUT(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )
  // ...
}
```

### Styling
- Tailwind CSS v4 (`@import "tailwindcss"` in globals.css)
- Use utility classes for layout, spacing, colors
- Responsive design with mobile-first approach
- Dark mode support via `dark:` modifier
- shadcn/ui components in `components/ui/` (built on Radix UI)
- Use `cn()` utility for class merging (`import { cn } from '@/lib/utils'`)

### File Organization
- Components: `app/[feature]/components/` or `components/`
- Pages: `app/[feature]/page.tsx`
- Layouts: `app/[feature]/layout.tsx`
- API routes: `app/api/[feature]/route.ts`
- Shared utilities: `lib/`
- Shared types: `types/`
- Database: `db/` (schema, migrations)

### Common Patterns
- **Canvas drawing**: Use `useRef` for canvas, quadratic curves, touch/mouse events
- **Leaflet maps**: Use `react-leaflet`, custom CSS for markers, handle geolocation
- **GPS extraction**: Use `exifr` to parse image metadata for coordinates
- **HEIC conversion**: Use `heic2any` for HEIC image support
- **Route grading**: French grade system (5A to 9C+)
- **Dynamic imports**: Always use `next/dynamic` with `ssr: false` for map/canvas components
- **Community**: Place-centric by default (`/community/places/[slug]`) with structured post types (`session`, `conditions`, `question`, `update`)
- **Rankings**: Two sorting modes - `grade` (average grade) and `tops` (climb count), both limited to last 60 days
- **Full-width mobile**: Use `min-h-screen bg-white dark:bg-gray-950` for page containers and `m-0 border-x-0 border-t-0 rounded-none` for cards

### Supabase Usage
- Client components: `createBrowserClient` from `@/lib/supabase`
- API routes/server components: `createServerClient` with cookies
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Always handle null states gracefully
- **System tables (auth.users)**: Use RPC functions with `SECURITY DEFINER` - see `get_user_count()` in database

```typescript
import { createServerClient } from '@supabase/ssr'

export async function getUserCount(): Promise<number> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
  const { data, error } = await supabase.rpc('get_user_count')
  if (error || !data) return 0
  return data
}
```

### Database
- Database schema and migrations in `db/` directory
- Run migrations: `supabase db push` or `supabase migration up`
- Generate types: `supabase gen types typescript --local > types/database.types.ts`

### Testing Migrations

**CRITICAL: NEVER push migrations to production before testing on local Supabase first.**

1. **Apply migrations to local database first:**
   ```bash
   # Apply all migrations to local Supabase
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/<migration_file>.sql
   
   # Or use the Supabase CLI
   supabase migration up
   ```

2. **Verify migration was applied correctly:**
   ```bash
   # Check if policy was created
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT policyname FROM pg_policies WHERE tablename = 'crags';"
   
   # Check foreign key constraints
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('climbs_crag_id_fkey', 'images_crag_id_fkey');"
   ```

3. **Test the feature locally:**
   - Start the dev server: `npm run dev`
   - Navigate to the feature and verify it works
   - Check for any errors in browser console

4. **Only then push to production:**
   ```bash
   supabase db push
   ```

**Why this matters:**
- Catching migration errors locally prevents production downtime
- Schema issues are easier to debug without real user data
- Foreign key and constraint problems won't affect production users

### Database Workflow (2-Person Team)

**Safety First:** `supabase db push` only modifies schema (tables, columns, functions, triggers). It does NOT delete or overwrite table data. However, always review migrations before pushing to prod.

Development
1. Create migration: `supabase migration new describe_change`
2. Edit migration file in `supabase/migrations/`
3. Test locally: `supabase migration up`

Deploy to Dev
1. Push code: `git add . && git commit -m "message" && git push origin dev`
2. Vercel auto-deploys to dev.letsboulder.com
3. Run schema: `supabase link --project-ref licfcldjccnqtounaeld`
4. Preview changes: `supabase db push --dry-run`
5. Apply if safe: `supabase db push`
6. Test: https://dev.letsboulder.com

Deploy to Prod
1. Merge: `git checkout main && git merge dev && git push origin main`
2. Link: `supabase link --project-ref glxnbxbkedeogtcivpsx`
3. Preview: `supabase db push --dry-run`
4. Apply: `supabase db push`
5. Test: https://letsboulder.com

Sync Data (Optional - Manual Process)
```bash
# Export prod data (schema NOT included)
supabase link --project-ref glxnbxbkedeogtcivpsx
supabase db dump --linked --data-only -f /tmp/prod_data.sql

# Import to dev (requires manual psql connection)
supabase link --project-ref licfcldjccnqtounaeld
psql "<dev-connection-string>" -f /tmp/prod_data.sql
```

**Warnings:**
- Never use `DROP TABLE`, `TRUNCATE`, or `DELETE` in migrations
- Use `CREATE OR REPLACE` for functions instead of `DROP` + `CREATE`
- Review all migrations with `git diff supabase/migrations/`
- If migrations are out of sync, use `--include-all` only after verification

### Next.js Specifics
- Next.js 16 App Router (Next 16.0.10) + React 19
- Server components by default, opt-in to client with `'use client'`
- Image domains configured in `next.config.ts`
- TypeScript plugin enabled in `tsconfig.json`

### CSRF Protection
This project uses CSRF protection for state-changing API requests (POST, PUT, DELETE, etc.).

**How it works:**
1. The `CsrfProvider` component (in `app/layout.tsx`) automatically fetches a CSRF token on page load
2. The token is stored in `localStorage` under the key `csrf_token`
3. All authenticated write requests must include the token in the `x-csrf-token` header

**For client-side requests:**
Use the `csrfFetch` helper from `@/hooks/useCsrf` instead of the native `fetch`:

```typescript
import { csrfFetch } from '@/hooks/useCsrf'

// Instead of:
fetch('/api/community/posts', { method: 'POST', body: JSON.stringify(data) })

// Use:
csrfFetch('/api/community/posts', { method: 'POST', body: JSON.stringify(data) })
```

**For server-side API routes:**
Use `withCsrfProtection` from `@/lib/csrf-server`:

```typescript
import { withCsrfProtection } from '@/lib/csrf-server'

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  // ... handle the request
}
```

**Common mistake:** Using regular `fetch` for DELETE/PUT/POST requests without the CSRF token will result in a 403 error with "Invalid or missing CSRF token".

### Miscellaneous
- No comments unless explaining complex logic (per project preference)
- Console.log for debugging; remove before committing
- Environment variables in `.env.local` (not committed)
- API keys and secrets never committed to version control
