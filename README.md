# 🧗 gsyrocks - Guernsey Climbing App

A modern web app for climbers to discover, log, and share climbing routes in Guernsey with interactive satellite maps.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + Auth)
- **Maps**: Leaflet + React Leaflet
- **Styling**: Tailwind CSS
- **Email**: Resend

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

- Interactive satellite map with climb locations
- Route logging and tracking
- User authentication via Supabase
- Photo uploads (Supabase Storage)
- Admin panel for pending climb approvals

## Deployment

Deployed on Vercel. Push to main triggers automatic deploys.



