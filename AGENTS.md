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

```typescript
'use client'
import { useState } from 'react'

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
- Cloudflare Workers: `workers/`

### Common Patterns
- **Canvas drawing**: Use `useRef` for canvas element, handle touch and mouse events, persist to localStorage for session
- **Leaflet maps**: Use `react-leaflet` components, custom CSS for markers, handle geolocation
- **GPS extraction**: Use `exifr` to parse image metadata for coordinates

### Supabase Usage
- Client components: `createClient` from `@/lib/supabase`
- API routes/server components: `createServerClient` with cookies
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Always handle null states gracefully

### Database
- Database schema and migrations in `db/` directory
- Run migrations: `supabase db push` or `supabase migration up`
- Generate types: `supabase gen types typescript --local > types/database.types.ts`
- Access db helper: `import { db } from '@/db'` (if using Drizzle/Kysely)

### Cloudflare Workers
- Worker scripts in `workers/` directory
- Deploy with `wrangler deploy`
- Environment variables in `wrangler.toml`

### Next.js Specifics
- Use Next.js App Router (Next 16)
- Server components by default, opt-in to client with `'use client'`
- Image domains: configured in `next.config.ts`
- TypeScript plugins enabled in `tsconfig.json`

### Miscellaneous
- No comments unless explaining complex logic (per project preference)
- Console.log for debugging; remove before committing
- Environment variables in `.env.local` (not committed)
- API keys and secrets never committed to version control
