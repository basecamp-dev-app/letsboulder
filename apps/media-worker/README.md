# Media Worker

Cloudflare Worker for media ingestion and delivery.

Responsibilities:
- authenticated `POST /enqueue` bridge for the Next.js app
- queue consumer for image readiness transitions
- public `GET /media/<key>` image delivery route
- internal `GET /origin/<key>` raw private R2 route

Secrets to configure with Wrangler:
- `INGRESS_SECRET`
- `INTERNAL_ORIGIN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_ACCESS_KEY_ID` (optional when moderation enabled)
- `AWS_SECRET_ACCESS_KEY` (optional when moderation enabled)

Vars to configure:
- `SUPABASE_URL`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BUCKET`
- `ENABLE_MODERATION`
- `MEDIA_MODERATION_PROVIDER`
- `MEDIA_HOST`
