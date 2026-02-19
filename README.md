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
- Supabase (PostgreSQL + Auth + Storage)
- Leaflet + React Leaflet for maps
- Tailwind CSS v4

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

**App**: Vercel auto-deploys on push to `dev` and `main` branches

**Database**: Run `supabase db push` after linking to the respective project
