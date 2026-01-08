# 🧗 gsyrocks - Guernsey Climbing App

A community-driven web app for climbers to discover, log, and share bouldering routes in Guernsey. Features interactive satellite maps, personal progress tracking, grade analytics, and a democratic approval workflow for new route submissions.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Maps**: Leaflet + React Leaflet
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Email**: Resend
- **Workers**: Cloudflare Workers (email moderation)

## UI Components

Uses shadcn/ui primitives (Card, Button, Input, Dialog, Skeleton) for consistent design. Components are in `components/ui/`. Run `npx shadcn@latest add <component>` to add new ones.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

## Features

- Interactive satellite map with climb locations and geolocation
- Personal logbook with grade history, grade pyramid, and top 10 hardest climbs
- Route logging (flash/top/try) with automatic point calculations
- Gender-segmented leaderboard with 60-day rolling average
- Route drawing tool for marking holds on photos
- Route naming and review workflow for submissions
- GPS-optional photo uploads with location confirmation
- Admin panel for pending climb approvals
- User profiles with avatar and grade progress ring

## Deployment

- **App**: Vercel (main branch triggers automatic deploys)
- **Email Worker**: Cloudflare Workers



