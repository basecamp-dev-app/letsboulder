# letsboulder - Bouldering Topos & Climbing Logbook

A community-driven web app for climbers to discover and share bouldering routes.

## Features

- **Interactive Map**: View all route locations with crag polygons
- **Route Submission**: Draw routes on photos with GPS location
- **Route Verification**: Community voting system (3+ verifications to confirm)
- **Grade Voting**: Crowd-sourced grade consensus
- **Logbook**: Track your sends (flash/top/try)
- **Community**: Find partners, plan sessions, and share place-based updates
- **Rankings**: See top climbers by grade or tops in the last 60 days (secondary)

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (PostgreSQL + Auth)
- Cloudflare Workers + Cloudflare R2 for media ingest and delivery
- Leaflet + React Leaflet for maps
- Tailwind CSS v4

## Architecture

- **Web app**: Next.js app deployed on Vercel
- **Database/Auth**: Supabase
- **Media pipeline**: Cloudflare Worker in `apps/media-worker`
- **Media storage**: private/public Cloudflare R2 buckets
- **Legacy note**: `workers/media` is retained only as a reference while the old polling worker is retired

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `.env.example` to `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deployment

| Environment | URL | Branch |
|-------------|-----|--------|
| Development | [dev.letsboulder.com](https://dev.letsboulder.com) | `dev` |
| Production | [letsboulder.com](https://letsboulder.com) | `main` |

**App**: Vercel auto-deploys on push to `dev` and `main`

**Media**: Cloudflare Worker + R2 back the image ingest and delivery flow used by both environments

**Database**: Run `supabase db push` after linking to the respective project

## Solo Workflow

- Do all day-to-day development in `dev`
- Test locally first with `npm run dev`
- Push `dev` when you want to verify the deployed staging environment
- After staging looks good, merge `dev` into `main` and push `main`
- Keep `main` as production-only and avoid direct commits there
- Keep a single local checkout in `/home/hadow/app-v2`; no separate `main` worktree is needed

Typical release flow:

```bash
git checkout dev
git pull origin dev

# work, test, commit
git push origin dev

git checkout main
git pull origin main
git merge dev
git push origin main

git checkout dev
git merge main
git push origin dev
```

<!-- test commit -->
