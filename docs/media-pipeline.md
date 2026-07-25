# Media Pipeline

## Upload Flow

1. Client calls server action to create an upload session (`lib/media/upload-session.ts`)
2. Server generates a presigned PUT URL via `createPrivateUploadUrl()` in `lib/media/r2.ts` (15 min TTL)
3. Client uploads directly to R2 private bucket using the presigned URL (`lib/media/client-upload.ts`)
4. Server records the upload metadata in the `images` table

## Processing Flow

1. Server validates the private R2 object exists and atomically queues ingest with `queue_media_ingest_job(...)`
2. The RPC updates `images.processing_status = 'queued'` and inserts or reuses a durable `media_jobs` row
3. Server best-effort dispatches the same payload to the Cloudflare Queue for immediate processing
4. The Queue consumer processes the image and completes the matching durable job
5. The scheduled handler claims any jobs missed by immediate dispatch with `claim_media_job(worker_name)`
6. Worker reads the object from the R2 private bucket (`lb-dev-media-private` / `lb-prod-media-private`)
7. Worker builds the variant manifest and updates the `images` table with public delivery metadata and status
8. Worker marks the `media_jobs` row `completed`, retries it with backoff, or marks it `failed`

## Delivery Flow

1. Browser requests an image
2. Next.js custom image loader (`lib/media/cloudflare-loader.ts`) constructs a CDN URL from `NEXT_PUBLIC_MEDIA_CDN_URL`
3. CDN (Cloudflare) serves the image from the R2 public bucket at `static.letsboulder.com` (prod) / `static.dev.letsboulder.com` (staging)
4. Worker `GET /media/<key>` serves public objects; `GET /origin/<key>` serves private originals with auth

## Moderation State

1. Automated moderation is disabled; uploads explicitly use `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`
2. Uploads remain private while durable ingest is queued or processing
3. The Worker publishes media only after successful processing, while preserving the skipped moderation state
4. GPS data is extracted client-side before upload and persisted on the `images` row

## Draft Image Flow

1. Unpublished images remain in the R2 private bucket
2. Server generates presigned GET URLs via `createPrivateReadUrl()` in `lib/media/r2.ts` (1 hour TTL)
3. Draft storage logic lives in `lib/media/draft-storage.ts`
4. On publish, the object moves to the public bucket and becomes available via CDN

## HEIC Conversion

1. Client detects HEIC/HEIF files via `lib/heic-converter.ts`
2. Conversion runs in a Web Worker (`workers/heic.worker.ts`) to avoid blocking the main thread
3. Converted image is uploaded as JPEG to the R2 private bucket
4. Original HEIC file is discarded client-side

## Environment Variables

| Variable | Scope | Description |
|---|---|---|
| `R2_S3_ENDPOINT` | Server | Cloudflare R2 S3-compatible endpoint |
| `R2_PRIVATE_BUCKET` | Server | Private bucket name |
| `R2_PUBLIC_BUCKET` | Server | Public bucket name |
| `R2_ACCESS_KEY_ID` | Server | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Server | R2 secret key |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Client + Server | CDN base URL for public media |
| `CF_MEDIA_WORKER_SECRET` | Worker | Optional auth token for legacy direct worker ingress |
