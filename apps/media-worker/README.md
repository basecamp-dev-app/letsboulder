# Media Worker

Cloudflare Worker for durable media readiness and deletion, virtual image delivery, and public map-asset delivery.

## Responsibilities

- Drain the durable Supabase `media_jobs` outbox on a schedule and update authoritative `images` readiness state.
- Produce, persist, and verify the private canonical WebP before atomically switching ready delivery.
- Drain `media_deletion_jobs` and idempotently remove allowlisted private R2 sources and canonical objects.
- Consume optional Cloudflare Queue fast-path messages and complete the matching durable jobs.
- Accept authenticated `POST /enqueue` for the app fast path and legacy backfill tooling.
- Serve virtual image paths by applying Cloudflare Image Resizing to private canonical WebPs on demand.
- Serve `/maps/*` objects from the public R2 bucket with CORS and range support.
- Serve secret-protected `/origin/*` private media objects for internal use.

The Worker writes one canonical WebP per successfully ingested image, but does not pre-render variant objects. `images.variants` is a virtual manifest: each ready path is resolved to the private canonical WebP and transformed when requested.

## Processing Flow

1. Upload completion atomically inserts/reuses `media_jobs`; that durable row is the source of truth.
2. The Next.js app may also call `POST /enqueue`, which publishes to `MEDIA_QUEUE` as a latency optimization.
3. The queue consumer processes immediate messages. The cron trigger runs every two minutes and claims durable jobs that still need work.
4. Processing verifies the prepared source, requests a scale-down WebP with maximum width 2560 px, quality 82, and `metadata: 'none'`, then writes the result to `images/assets/<image UUID>/<SHA-256>/canonical.webp` in the private bucket.
5. The Worker verifies canonical size and content type before calling `commit_media_webp`. That service-only RPC atomically stores canonical metadata, switches delivery and linked-draft locators, marks the image ready/public, and queues the prepared source for deletion with reason `source_replaced`.
6. Only after commit succeeds does the Worker explicitly attempt source deletion. Failure does not fail ingest because `media_deletion_jobs` retains durable retry work.
7. A queue completion closes queued/processing jobs for the image; scheduled processing records completion, retry/backoff, or terminal failure on its claimed job.

Before canonical commit, any transform, write, verification, or RPC failure leaves the prepared source available and delivery unswitched. A failed RPC can leave an unreferenced canonical object; retrying deterministic output writes the same content-addressed key. After commit, the original bucket/key remain provenance even though the source may be removed immediately or by the outbox. Ready images with a canonical locator never fall back to the original; legacy ready rows continue using their original only until backfill commits a canonical WebP.

Deletion is a separate scheduled flow. Canonical commit transactionally queues the replaced source, while database triggers capture both valid original and optimized locators before image rows are tombstoned or removed and cancel active ingest. The Worker claims each job with an expiring claim token, validates the bucket against `R2_PRIVATE_BUCKET`, deletes idempotently through `ORIGINALS_BUCKET`, and uses token-protected completion/retry RPCs. Completing a `source_replaced` job stamps `original_deleted_at`; it does not clear the provenance locator. Completed jobs are retained for 30 days.

## Delivery Routes

| Route | Backing source | Access / behavior |
|---|---|---|
| Virtual image path or `?variant=` | Canonical WebP in `ORIGINALS_BUCKET` through `R2_ORIGIN_URL` | Public, on-demand Cloudflare Image Resizing; long-lived cache |
| `/maps/*` | `PUBLIC_BUCKET` | Public map assets; GET/HEAD/OPTIONS, CORS, byte ranges |
| `/origin/*` | `ORIGINALS_BUCKET` | Requires `X-Internal-Secret`; raw private bytes |
| `POST /enqueue` | `MEDIA_QUEUE` | Requires `Authorization: Bearer <INGRESS_SECRET>` |

Cloudflare canonical creation and variant requests use `metadata: 'none'`. Browser preparation also disables EXIF preservation, but the repository does not independently validate stripping for every Cloudflare output/cache path.

## Environments

| Environment | CDN host | Private media bucket | Public map/assets bucket | Supabase |
|---|---|---|---|---|
| Staging | `static.dev.letsboulder.com` | `lb-dev-media-private` (prepared sources and canonical WebPs) | `lb-dev-media-public` | `pfleqxztfiddujvylvaz.supabase.co` |
| Production | `static.letsboulder.com` | `lb-prod-media-private` (prepared sources and canonical WebPs) | `lb-prod-media-public` | `glxnbxbkedeogtcivpsx.supabase.co` |

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
