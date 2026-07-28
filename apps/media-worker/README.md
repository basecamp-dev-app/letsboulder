# Media Worker

Cloudflare Worker for durable media readiness and deletion, virtual image delivery, and public map-asset delivery.

## Responsibilities

- Drain the durable Supabase `media_jobs` outbox on a schedule and update authoritative `images` readiness state.
- Drain `media_deletion_jobs` and idempotently remove allowlisted private R2 originals.
- Consume optional Cloudflare Queue fast-path messages and complete the matching durable jobs.
- Accept authenticated `POST /enqueue` for the app fast path and legacy backfill tooling.
- Serve virtual image paths by applying Cloudflare Image Resizing to private originals on demand.
- Serve `/maps/*` objects from the public R2 bucket with CORS and range support.
- Serve secret-protected `/origin/*` private originals for internal use.

The Worker does not pre-render or write image variants. `images.variants` is a virtual manifest: each path is resolved to the private original and transformed when requested.

## Processing Flow

1. Upload completion atomically inserts/reuses `media_jobs`; that durable row is the source of truth.
2. The Next.js app may also call `POST /enqueue`, which publishes to `MEDIA_QUEUE` as a latency optimization.
3. The queue consumer processes immediate messages. The cron trigger runs every two minutes and claims durable jobs that still need work.
4. Processing verifies the private object, stores virtual delivery metadata, sets moderation to skipped/disabled, and marks the image ready/public.
5. A queue completion closes queued/processing jobs for the image; scheduled processing records completion, retry/backoff, or terminal failure on its claimed job.

Private-original deletion is a separate scheduled flow. Database triggers validate canonical image-UUID-namespaced keys, transactionally capture bucket/key coordinates before source rows are tombstoned or removed, and cancel active ingest for the image. The Worker claims each job with an expiring claim token, validates the bucket against `R2_PRIVATE_BUCKET`, deletes through `ORIGINALS_BUCKET`, and uses token-protected completion/retry RPCs. Completed jobs are retained for 30 days.

## Delivery Routes

| Route | Backing source | Access / behavior |
|---|---|---|
| Virtual image path or `?variant=` | `ORIGINALS_BUCKET` through `R2_ORIGIN_URL` | Public, on-demand Cloudflare Image Resizing; long-lived cache |
| `/maps/*` | `PUBLIC_BUCKET` | Public map assets; GET/HEAD/OPTIONS, CORS, byte ranges |
| `/origin/*` | `ORIGINALS_BUCKET` | Requires `X-Internal-Secret`; raw private bytes |
| `POST /enqueue` | `MEDIA_QUEUE` | Requires `Authorization: Bearer <INGRESS_SECRET>` |

Cloudflare image requests use `metadata: 'none'` to request metadata stripping. Private originals can still contain EXIF, and the repository does not independently validate stripping for every Cloudflare output/cache path.

## Environments

| Environment | CDN host | Private originals | Public map/assets bucket | Supabase |
|---|---|---|---|---|
| Staging | `static.dev.letsboulder.com` | `lb-dev-media-private` | `lb-dev-media-public` | `pfleqxztfiddujvylvaz.supabase.co` |
| Production | `static.letsboulder.com` | `lb-prod-media-private` | `lb-prod-media-public` | `glxnbxbkedeogtcivpsx.supabase.co` |

Queues are `media-transform-queue-staging` and `media-transform-queue-prod`, with batch size 1. They are an optional fast path and a compatibility path for backfill, not the durable record of app-owned ingest.

## Bindings, Vars, And Secrets

R2 bindings in `wrangler.toml`:

- `ORIGINALS_BUCKET` -> the environment's private bucket.
- `PUBLIC_BUCKET` -> the environment's public map/assets bucket.
- `MEDIA_QUEUE` -> the environment's Cloudflare Queue.

Plain vars in `wrangler.toml`:

- `SUPABASE_URL`
- `R2_ORIGIN_URL`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BUCKET`
- `MEDIA_HOST`

Configure Worker secrets with `wrangler secret put`:

- `INGRESS_SECRET`: must equal the Next.js/backfill `CF_MEDIA_WORKER_SECRET`; authenticates `POST /enqueue`.
- `INTERNAL_ORIGIN_SECRET`: authenticates `GET /origin/*`; it is independent of the enqueue secret.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase access for job and image updates.

The Next.js app's R2 access key and secret are used for S3 presigning and are not Worker secrets because the Worker uses R2 bindings.

## Source And Deployment

| Path | Purpose |
|---|---|
| `src/index.ts` | Fetch, queue, cron, ingest, and delivery handlers |
| `src/deletion-outbox.ts` | Private-original deletion claim, processing, and retention drain |
| `src/config.ts` | Named virtual widths and output formats |
| `src/schema.ts` | Queue payload validation |
| `src/supabase.ts` | Worker environment contract and Supabase client |
| `wrangler.toml` | Environment routes, cron, queue, and R2 bindings |

Production deploys from `.github/workflows/media-worker-deploy.yml` when worker files change. The workflow uses the `Production` GitHub environment.

```bash
npx wrangler deploy --env staging
npx wrangler deploy --env production
npx wrangler tail --env staging
npx wrangler tail --env production
```
