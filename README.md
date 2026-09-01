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
- **Open data**: Signed nightly ODbL snapshots in a dedicated public R2 bucket

### Repository Map

Use this map to find the right place for a change:

| Need | Start here | Then check |
|---|---|---|
| Route/page behavior | `app/` | Owning `features/<domain>/` and `tests/app/` |
| Product-domain behavior | `features/<domain>/` | Its `server/`, `actions.ts`, hooks, and tests |
| Shared UI or app shell | `components/` | `components/ui/` and component tests |
| Cross-feature technical code | `lib/` | Existing patterns in `docs/patterns.md` |
| API behavior | `app/api/` | `docs/api/routes.md` and `tests/api/` |
| Database behavior | `supabase/migrations/` | `docs/db/schema.md`, database tests, and generated `types/database.ts` |
| Media processing | `apps/media-worker/` | `docs/media-pipeline.md` and the worker README |
| Maintenance and verification | `scripts/` and `docs/verify.sh` | `package.json` scripts |

For the authoritative topic index, see [docs/README.md](docs/README.md). For contribution and validation rules, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Getting Started

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for full local development setup.

### Prerequisites

- Node.js `22.23.2` and npm
- A Docker-compatible runtime for `supabase start`

```bash
npm install
npx --no-install supabase start
cp .env.example .env.local
npx --no-install supabase db reset
npx --no-install supabase gen types typescript --local > types/database.ts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`.env.example`](.env.example) for the categorized application, media, integration, and test variables. Minimum local setup uses the credentials printed by `npx --no-install supabase status` plus locally generated secrets.

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
| `PUBLIC_DATA_EXPORT_DATABASE_URL` | Export workflow | Dedicated read-only PostgreSQL login; never a service-role credential |
| `OPEN_DATA_R2_ACCESS_KEY_ID`, `OPEN_DATA_R2_SECRET_ACCESS_KEY` | Export workflow | Dedicated public-data bucket credentials |
| `R2_PRIVATE_INVENTORY_ACCESS_KEY_ID`, `R2_PRIVATE_INVENTORY_SECRET_ACCESS_KEY`, `R2_PUBLIC_INVENTORY_ACCESS_KEY_ID`, `R2_PUBLIC_INVENTORY_SECRET_ACCESS_KEY` | Inventory workflows | Dedicated read-only S3 credentials scoped to the named inventory bucket |
| `OPEN_DATA_MINISIGN_PRIVATE_KEY`, `OPEN_DATA_MINISIGN_PUBLIC_KEY` | Export workflow | Matching signing keys stored in the protected Production environment |
| `OPEN_DATA_R2_ENDPOINT`, `OPEN_DATA_R2_BUCKET`, `OPEN_DATA_PUBLIC_BASE_URL` | Export workflow | Production environment variables for storage and public discovery |

## Deployment

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | [dev.letsboulder.com](https://dev.letsboulder.com) | `dev` |
| Staging | [staging.letsboulder.com](https://staging.letsboulder.com) | `staging` |
| Production | [letsboulder.com](https://letsboulder.com) | `main` |

**App**: The hosted-staging workflow validates the database and triggers the staging Vercel deploy hook after every push to `staging`. CI triggers the production Vercel deploy hook after successful pushes to `main`. Preview and development deployment behavior is managed in Vercel.

**Media Worker**: Cloudflare Worker deployed via Wrangler (`apps/media-worker/wrangler.toml`)

**Database**: Maintainers verify the linked project and run `npx --no-install supabase db push --linked --dry-run` before deployment

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
- [Security Policy](SECURITY.md) — supported deployment and private vulnerability reporting

### Reference docs

- [Architecture](docs/architecture.md) — system topology and data flow
- [Documentation Index](docs/README.md) — source-of-truth and topic map
- [Database Schema](docs/db/schema.md) — tables, RPCs, grade system, cascade logic
- [Migrations](docs/db/migrations.md) — migration workflow and safety rules
- [Patterns](docs/patterns.md) — canvas, maps, GPS, HEIC, offline, media pipeline
- [Media Pipeline](docs/media-pipeline.md) — end-to-end image ingest and delivery
- [Open Data Exports](docs/open-data-exports.md) - ODbL artifacts, verification, retention, and operations
- [API Routes](docs/api/routes.md) — route handler reference
- [Testing](docs/testing/) — E2E, unit, and integration test guide
- [Auth & Security](docs/auth-security.md) — CSRF, rate limiting, auth patterns
- [Submission Workflow](docs/submission-workflow.md) — draft-to-publish pipeline
- [Submission Controls](docs/ui/submission-controls.md) — reusable UI contracts
- [Moderation](docs/moderation.md) — media readiness, reports, and verification systems
