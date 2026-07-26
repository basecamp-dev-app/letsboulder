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
- **Network Resilience**: Clear connection states, retryable uploads, and session-level query caching
- **Admin Dashboard**: Crag management, flag moderation, gym management, and submission review

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (PostgreSQL 17 + Auth + PostGIS)
- Cloudflare Workers + Cloudflare R2 for media ingest and delivery
- MapLibre GL + OpenFreeMap + Supercluster for maps
- Tailwind CSS v4 + shadcn/ui
- Zustand (transient route-editor state) + TanStack React Query (server state with selective IndexedDB persistence)
- Playwright (E2E) + Vitest (unit/integration)

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system topology.

- **Web app**: Next.js deployed on Vercel
- **Database/Auth**: Supabase (PostgreSQL 17 with PostGIS)
- **Media pipeline**: Cloudflare Worker in `apps/media-worker` backed by R2 buckets
- **Media delivery**: CDN at `static.letsboulder.com` (prod) / `static.dev.letsboulder.com` (staging)
- **Network resilience**: Online-first loading with explicit connection and retry states

## Getting Started

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for full local development setup.

### Prerequisites

- Node.js `20.20.0` and npm
- A Docker-compatible runtime for `supabase start`

```bash
npm install
npx supabase start
cp .env.example .env.local
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`.env.example`](.env.example) for the categorized application, media, integration, and test variables. Minimum local setup uses the credentials printed by `npx supabase status` plus locally generated secrets.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server features | Supabase service role key (server-only) |
| `CSRF_SECRET` | Yes | JWT signing secret for CSRF tokens |
| `DELETE_ACCOUNT_SECRET` | Yes | Account deletion token secret |
| `R2_*` | Media | R2 endpoint, buckets, and presigning credentials |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Media | CDN base URL |
| `RESEND_API_KEY` | No | Transactional emails (Resend) |

## Deployment

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | [dev.letsboulder.com](https://dev.letsboulder.com) | `dev` |
| Production | [letsboulder.com](https://letsboulder.com) | `main` |

**App**: CI triggers the production Vercel deploy hook after successful pushes to `main`. Preview and development deployment behavior is managed in Vercel.

**Media Worker**: Cloudflare Worker deployed via Wrangler (`apps/media-worker/wrangler.toml`)

**Database**: Maintainers verify the linked project and run `npx supabase db push --linked --dry-run` before deployment

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
- [Documentation Index](docs/README.md) — source-of-truth and topic map
- [Database Schema](docs/db/schema.md) — tables, RPCs, grade system, cascade logic
- [Migrations](docs/db/migrations.md) — migration workflow and safety rules
- [Patterns](docs/patterns.md) — canvas, maps, GPS, HEIC, offline, media pipeline
- [Media Pipeline](docs/media-pipeline.md) — end-to-end image ingest and delivery
- [API Routes](docs/api/routes.md) — route handler reference
- [Testing](docs/testing/) — E2E, unit, and integration test guide
- [Auth & Security](docs/auth-security.md) — CSRF, rate limiting, auth patterns
- [Submission Workflow](docs/submission-workflow.md) — draft-to-publish pipeline
- [Submission Controls](docs/ui/submission-controls.md) — reusable UI contracts
- [Moderation](docs/moderation.md) — media readiness, reports, and verification systems
