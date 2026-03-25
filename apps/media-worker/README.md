# Media Worker

Cloudflare Worker for media ingestion and delivery on letsboulder.com.

## Responsibilities

- Authenticated `POST /enqueue` bridge for the Next.js app
- Queue consumer for image readiness transitions
- Public `GET /media/<key>` image delivery route
- Internal `GET /origin/<key>` raw private R2 route

## Source Files

```
apps/media-worker/
  src/
    config.ts      — Worker configuration
    index.ts       — Entry point, route handlers
    schema.ts      — Request/response schemas
    supabase.ts    — Supabase client for status updates
  wrangler.toml    — Cloudflare configuration
  package.json
```

## Environments

| Environment | CDN Host | R2 Private Bucket | R2 Public Bucket | Supabase |
|------------|----------|-------------------|------------------|----------|
| Staging | static.dev.letsboulder.com | lb-dev-media-private | lb-dev-media-public | pfleqxztfiddujvylvaz.supabase.co |
| Production | static.letsboulder.com | lb-prod-media-private | lb-prod-media-public | glxnbxbkedeogtcivpsx.supabase.co |

## Queues

- Staging: `media-transform-queue-staging`
- Production: `media-transform-queue-prod`
- Batch size: 1

## Secrets

Configure with `wrangler secret put`:

- `INGRESS_SECRET` — shared secret for Next.js to Worker auth
- `INTERNAL_ORIGIN_SECRET` — secret for `/origin/` route
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role
- `AWS_ACCESS_KEY_ID` — (optional, for moderation)
- `AWS_SECRET_ACCESS_KEY` — (optional, for moderation)

## Vars (in wrangler.toml)

- `SUPABASE_URL`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BUCKET`
- `ENABLE_MODERATION`
- `MEDIA_MODERATION_PROVIDER`
- `MEDIA_HOST`

## Deployment

```bash
npx wrangler deploy --env staging
npx wrangler deploy --env production
```

## Logs

```bash
npx wrangler tail --env staging
npx wrangler tail --env production
```

## Flow

1. Next.js app receives image upload
2. Client uploads to R2 via presigned URL
3. Next.js calls `POST /enqueue` on Worker with image metadata
4. Worker queues image for processing via Cloudflare Queues
5. Queue consumer processes image (resize, generate variants)
6. Worker writes variants to R2 public bucket
7. Worker updates `images` table in Supabase
8. CDN serves variants from `static.*.com`
