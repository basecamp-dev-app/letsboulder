# Architecture — letsboulder.com

Bouldering topo and climbing logbook web app.

## System Topology

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Browser   │────▶│  Next.js (Vercel) │────▶│  Supabase    │
│             │     │  App Router       │     │  PostgreSQL  │
│             │     │  Server Actions   │     │  + Auth      │
│             │     │  Route Handlers   │     │  + PostGIS   │
└──────┬──────┘     └──────────────────┘     └──────────────┘
       │
       │  Image upload / delivery
       ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Cloudflare      │────▶│  Cloudflare R2   │────▶│  CDN         │
│  Worker          │     │  (S3-compatible)  │     │  static.*    │
│  (media-worker)  │     │  private bucket   │     │  .com        │
│                  │     │  public bucket    │     │              │
└──────────────────┘     └──────────────────┘     └──────────────┘
```

## Components

### Web App (Next.js 16)

- **Location**: Root of repo
- **Deploy**: Vercel, auto-deploys from `main` branch
- **Router**: App Router (`app/`) with Server Components and Server Actions
- **Client State**: feature route editor store (`features/route-editor/store/index.ts`) for route drawing state
- **Server State**: TanStack React Query with 12-hour IndexedDB persistence (`lib/query-persistence.ts`)
- **Images**: Custom Cloudflare image loader (`lib/media/cloudflare-loader.ts`)

### Database (Supabase / PostgreSQL 17)

- **Auth**: Supabase Auth with JWT sessions
- **Extensions**: PostGIS for geo queries
- **Key RPCs**: `get_crag_pins`, `get_crag_route_intelligence`, `get_upload_context`, `create_unified_submission`
- **Migrations**: `supabase/migrations/*.sql` (includes historical placeholder versions for remote-only migrations; canonical source of truth)
- **Types**: Auto-generated in `types/database.ts` via `supabase gen types`

### Media Pipeline (Cloudflare Worker + R2)

- **Worker**: `apps/media-worker/` — queue consumer for image processing
- **Storage**: R2 private bucket (originals) + R2 public bucket (processed variants)
- **CDN**: `static.letsboulder.com` (prod) / `static.dev.letsboulder.com` (staging)
- **Flow**: Client → presigned upload URL → R2 private → Worker queue → R2 public → CDN
- **Config**: `wrangler.toml` with staging and production environments

### Service Worker (PWA / Offline)

- **Location**: `public/sw.js`
- **Caches**: shell, packs, media, tiles, route assets, transient
- **Pack System**: Save crags/climbs for offline via `SAVE_CRAG_PACK` / `SAVE_CLIMB_PACK` messages
- **Offline Pages**: `/offline` (launcher), `/offline/library` (saved packs)

## Data Flow

### Image Upload

1. Client requests presigned URL from `/api/uploads/signed-url`
2. Client uploads directly to R2 private bucket
3. Worker receives queue message, processes image (resize, variants)
4. Worker writes processed variants to R2 public bucket
5. CDN serves variants from `static.*.com`
6. `images` table tracks processing state

### Route Submission

1. User creates draft in `submission_drafts`
2. User uploads images → draft images attached
3. User draws route lines on images (Canvas API)
4. User promotes draft → `submissions` table + `climbs` table + `images` table
5. Community verifies routes (3+ votes to confirm)

### Authentication

1. Supabase Auth issues JWT
2. Browser stores session in cookies via `@supabase/ssr`
3. Server Actions verify JWT via `supabase.auth.getUser()`
4. CSRF protection via JWT tokens in httpOnly cookies (`lib/csrf.ts`)
5. The `x-internal-user-id` header is stripped by middleware (`proxy.ts`) to prevent spoofing

## Module Boundaries

The web app is standardizing on feature-first product boundaries.

- `app/` owns route entrypoints, route-local wrappers, and route-level composition of feature-owned hooks/components. Reusable product logic should not live in `app/`.
- `features/` owns product-domain code: domain components, hooks, server loaders, actions, types, and feature-local utilities.
- `components/` owns shared app shell and reusable UI, especially `components/ui/`.
- `lib/` owns cross-feature technical utilities and platform integrations.
- `hooks/` should be limited to cross-feature generic hooks; domain hooks should live under their feature.
- `store/` should only hold shared app-wide stores; feature-specific stores should move under the owning feature.
- Submission and draft route handlers should stay thin in `app/api/**`; validation, orchestration, and response shaping should live under `features/submissions/server/**`.

### Import Rules

- Do not import reusable logic from `app/**`.
- Route files in `app/` may import from `features/**`, `components/**`, `lib/**`, `hooks/**`, `store/**`, and `types/**`.
- Code outside `app/` must not import from `@/app/**`; if something needs to be reused, move it into `features/**` or another shared layer first.
- New product-domain code should default to `features/<domain>/` rather than the root `components/`, `hooks/`, or `lib/` folders.

## Key Files

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout, fonts, metadata, theme |
| `lib/supabase.ts` | Browser Supabase client (singleton) |
| `lib/supabase-server.ts` | Server Supabase client with cached RPCs |
| `types/database.ts` | Auto-generated DB types (3,365 lines) |
| `lib/csrf.ts` | JWT-based CSRF token system |
| `lib/rate-limit.ts` | Upstash Redis rate limiter (12 tiers) |
| `lib/media/r2.ts` | Cloudflare R2 S3 operations |
| `lib/grades.ts` | Grade conversion engine (3A-9C+) |
| `public/sw.js` | Service worker for offline PWA |
| `features/route-editor/components/UnifiedRouteCanvas.tsx` | Canvas-based route drawing |
| `features/route-editor/store/index.ts` | Zustand store for route selection |
| `features/submissions/server/submissions/` | Submission API validation and mode executors |
| `features/submissions/server/drafts/` | Draft API orchestration, collaboration, and promotion helpers |
| `supabase/migrations/` | 223 SQL migration files |
