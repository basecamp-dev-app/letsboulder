# Media Pipeline

## Upload Flow

1. Client calls server action to create an upload session (`lib/media/upload-session.ts`)
2. Server generates a presigned PUT URL via `createPrivateUploadUrl()` in `lib/media/r2.ts` (15 min TTL)
3. Client uploads directly to R2 private bucket using the presigned URL (`lib/media/client-upload.ts`)
4. Server records the upload metadata in the `media` table

## Processing Flow

1. Server enqueues the media key to Cloudflare Queues via `POST /enqueue` on the media worker (`apps/media-worker/wrangler.toml`)
2. Worker reads the object from the R2 private bucket (`lb-dev-media-private` / `lb-prod-media-private`)
3. Worker generates variants (resize, format conversion, thumbnail)
4. Worker writes processed variants to the R2 public bucket (`lb-dev-media-public` / `lb-prod-media-public`)
5. Worker updates the `media` table with variant metadata and status

## Delivery Flow

1. Browser requests an image
2. Next.js custom image loader (`lib/media/cloudflare-loader.ts`) constructs a CDN URL from `NEXT_PUBLIC_MEDIA_CDN_URL`
3. CDN (Cloudflare) serves the image from the R2 public bucket at `static.letsboulder.com` (prod) / `static.dev.letsboulder.com` (staging)
4. Worker `GET /media/<key>` serves public objects; `GET /origin/<key>` serves private originals with auth

## Moderation Flow

1. After upload, server calls AWS Rekognition via `lib/image-moderation.ts`
2. GPS data is extracted via `lib/image-gps.ts` and `lib/image-metadata.ts`
3. If moderation fails, the media record is flagged and the object is not enqueued for processing
4. Moderation is optional and runs server-side before queue dispatch

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
| `CF_MEDIA_WORKER_INGRESS_SECRET` | Server | Optional auth token for worker ingress |
