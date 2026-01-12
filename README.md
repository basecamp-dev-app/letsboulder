# gsyrocks - Guernsey Climbing Routes

A community-driven web app for climbers to discover and share bouldering routes.

## Features

- **Interactive Satellite Map**: View all route locations with crag polygons
- **Route Submission**: Draw routes on photos with GPS location
- **Route Verification**: Community voting system (3+ verifications to confirm)
- **Grade Voting**: Crowd-sourced grade consensus
- **Logbook**: Track your sends (flash/top/try)

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

- **App**: Vercel (main branch)
