# Media Worker

Cloudflare Worker for media ingestion and delivery on letsboulder.com.

## Responsibilities

- Scheduled durable `media_jobs` processing for image readiness transitions
- Authenticated `POST /enqueue` and queue consumer retained for backfill compatibility
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

## Queue Compatibility

- Staging: `media-transform-queue-staging`
- Production: `media-transform-queue-prod`
- Batch size: 1

New uploads use the durable `media_jobs` outbox. Cloudflare Queues remain configured only because the backfill tooling still calls `POST /enqueue`.

## Secrets

Configure with `wrangler secret put`:

- `INGRESS_SECRET` — shared secret for Next.js to Worker auth
- `INTERNAL_ORIGIN_SECRET` — secret for `/origin/` route
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role

## Vars (in wrangler.toml)

- `SUPABASE_URL`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BUCKET`
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
3. Next.js atomically inserts a durable `media_jobs` row
4. The scheduled Worker claims and processes the job
5. Worker records moderation as skipped and publishes only after successful processing
6. CDN serves variants from `static.*.com`
