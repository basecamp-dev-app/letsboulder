# letsboulder

Open-source bouldering topos, route discovery, and climbing logbook.

letsboulder is open source under the [Apache License 2.0](LICENSE).

## Features

- **Interactive Map**: View all route locations with clustered crag pins
- **Route Submission**: Draw routes on photos with GPS location and EXIF extraction
- **Route Verification**: Community voting system (3+ verifications to confirm)
- **Grade Voting**: Crowd-sourced grade consensus across V-Scale, Font, YDS, French, and British systems
- **Logbook**: Track your sends (flash/top/try) with grade pyramids, history charts, and rankings
- **Community**: Session planning, conditions updates, questions, and place-based posts
- **Rankings**: Top climbers by grade or sends in the last 60 days
- **Crag Sectors**: Organize climbs within crags by sector
- **Gym Support**: Indoor gym floor plans, gym routes, gym memberships, and gym owner applications
- **Offline / PWA**: Save crags for offline use with cached tiles, media, and route data
- **Admin Dashboard**: Crag management, flag moderation, gym management, and submission review

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (PostgreSQL 17 + Auth + PostGIS)
- Cloudflare Workers + Cloudflare R2 for media ingest and delivery
- Leaflet + React Leaflet + Supercluster for maps
- Tailwind CSS v4 + shadcn/ui
- Zustand (client state) + TanStack React Query (server state with IndexedDB persistence)
- Playwright (E2E) + Vitest (unit/integration)

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system topology.

- **Web app**: Next.js deployed on Vercel
- **Database/Auth**: Supabase (PostgreSQL 17 with PostGIS)
- **Media pipeline**: Cloudflare Worker in `apps/media-worker` backed by R2 buckets
- **Media delivery**: CDN at `static.letsboulder.com` (prod) / `static.dev.letsboulder.com` (staging)
- **Offline**: Service worker (`public/sw.js`) with pack-based caching

## Getting Started

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for full local development setup.

### Prerequisites

- Node.js and npm
- Supabase CLI
- A Docker-compatible runtime for `supabase start`

```bash
npm install
supabase start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`.env.example`](.env.example) for the complete list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `R2_S3_ENDPOINT` | Yes | Cloudflare R2 S3 endpoint |
| `R2_PRIVATE_BUCKET` | Yes | R2 bucket for private originals |
| `R2_PUBLIC_BUCKET` | Yes | R2 bucket for public variants |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Yes | CDN base URL |
| `CSRF_SECRET` | Prod | JWT signing secret for CSRF tokens |
| `INTERNAL_MODERATION_SECRET` | Prod | Photo moderation queue secret |
| `RESEND_API_KEY` | No | Transactional emails (Resend) |

## Deployment

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | [dev.letsboulder.com](https://dev.letsboulder.com) | `dev` |
| Production | [letsboulder.com](https://letsboulder.com) | `main` |

**App**: Vercel auto-deploys on push to `dev` and `main`

**Media Worker**: Cloudflare Worker deployed via Wrangler (`apps/media-worker/wrangler.toml`)

**Database**: Run `supabase db push --linked` after linking to the respective project

## Contributing

Small fixes are welcome. For larger changes, open an issue or start a discussion before you begin so the scope stays aligned.

Typical workflow:

```bash
git checkout -b my-change

# work, test, commit
git push -u origin my-change

# open a pull request against main

# CI runs automatically
# Vercel deploys to letsboulder.com
```

## Documentation

### Contributor docs

- [Local Setup](LOCAL_SETUP.md) — dev environment setup
- [Contributing](CONTRIBUTING.md) — workflow, code style, and review expectations

### Reference docs

- [Architecture](docs/architecture.md) — system topology and data flow
- [Database Schema](docs/db/schema.md) — tables, RPCs, grade system, cascade logic
- [Migrations](docs/db/migrations.md) — migration workflow and safety rules
- [Patterns](docs/patterns.md) — canvas, maps, GPS, HEIC, offline, media pipeline
- [Media Pipeline](docs/media-pipeline.md) — end-to-end image ingest and delivery
- [API Routes](docs/api/routes.md) — route handler reference
- [Testing](docs/testing/) — E2E, unit, and integration test guide
- [Auth & Security](docs/auth-security.md) — CSRF, rate limiting, auth patterns
- [Offline / PWA](docs/offline-pwa.md) — service worker, pack building, cache layers
- [Submission Workflow](docs/submission-workflow.md) — draft-to-publish pipeline
