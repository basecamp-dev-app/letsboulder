# Media Pipeline

## Upload And Ingest

1. The client reads GPS from the selected original `File` while preparing a JPEG with `browser-image-compression`: maximum width or height 3200 px, maximum size 3 MiB, initial quality 0.88, `image/jpeg`, and `preserveExif: false`. HEIC/HEIF is converted to JPEG before this bounded compression. GPS therefore comes from the source before its metadata is discarded, not from the stripped upload.
2. Before network work starts, the client stores the prepared JPEG and queue metadata in auth-scoped IndexedDB. The same prepared `File` instance is measured, declared to the upload-session API, and sent to R2; recovery reconstructs a `File` from those persisted exact bytes instead of preprocessing the selected source again.
3. The authenticated client calls the `POST /api/media/upload-sessions` Route Handler. The request identifies a `draft_image`, `crag_image`, or `submission_image` and includes prepared dimensions plus client-extracted capture/GPS data when available.
4. The Route Handler creates the authoritative `images` row as private/pending and returns a presigned R2 `PUT` URL from `createPrivateUploadUrl()` (`lib/media/r2.ts`, 15-minute TTL). The auth-scoped `clientUploadId` is unique per user, so replaying session creation recovers the same image row and renews the signed URL.
5. The browser uploads the prepared JPEG directly to the private R2 bucket. The app server does not proxy the bytes.
6. The client calls `POST /api/media/upload-sessions/<imageId>/complete`. The handler verifies ownership and that the private object exists.
7. `finalize_media_upload(...)` atomically commits the immutable original locator and invokes `queue_media_ingest_job(...)`, which changes the image to queued and inserts or reuses a durable `media_jobs` row. This database outbox is the source of truth and finalization is replay-safe.
8. If `CF_MEDIA_WORKER_URL` and `CF_MEDIA_WORKER_SECRET` are configured, completion also best-effort calls Worker `POST /enqueue`. That Cloudflare Queue path reduces latency but is optional; its failure does not invalidate the durable job.
9. The Worker queue consumer handles the fast path. Its scheduled handler uses its service-role client to call service-only `claim_media_job(worker_name)` and recover durable work, with retry/backoff and terminal failure recorded in `media_jobs`.

## Canonical WebP Commit

1. Ingest validates that the job locator still matches the image's immutable original locator and that the source exists in the configured private bucket.
2. Cloudflare Image Resizing reads that source and produces a scale-down WebP at maximum width 2560 px, quality 82, and `metadata: 'none'`.
3. The Worker hashes the returned bytes, writes them as `images/assets/<image UUID>/<SHA-256>/canonical.webp` in the same private R2 bucket, then verifies the stored size and `image/webp` content type.
4. Only after verification does service-only `commit_media_webp(...)` lock the image and atomically store the canonical locator and dimensions, virtual manifest, URL, and ready/public state; switch draft and public delivery locators to the canonical WebP; and enqueue the old source in `media_deletion_jobs` with reason `source_replaced`.
5. After that transaction succeeds, the Worker explicitly attempts to delete the source immediately. Failure is non-fatal because the committed deletion job remains queued for scheduled, idempotent retries.

The canonical WebP is the persisted delivery source, not a transient response and not a public-bucket object. `original_bucket` and `original_key` remain immutable provenance after the switch, but callers must not assume that object still exists. The lifecycle timestamps distinguish deletion queued from deletion confirmed; scheduled completion of the `source_replaced` job records `original_deleted_at` after an idempotent delete, including when the immediate attempt already removed the object.

Failure ordering is deliberate. A resize, canonical write, or verification failure leaves the image uncommitted to canonical ready delivery and does not request source deletion. A commit failure also leaves the source in place; the immutable content-addressed canonical write may be orphaned temporarily and a retry overwrites the same key for the same bytes. Source deletion is attempted only after the transaction has both switched delivery and durably queued cleanup. Image deletion separately queues any valid original and canonical locators, so cleanup does not depend on either object still being present.

## Transactional Media Deletion

1. Image tombstones and hard deletes capture the private R2 bucket/key in `media_deletion_jobs` before the authoritative `images` row changes. This covers account, published-submission, linked-draft-image, and unassociated-upload deletion. The trigger insert participates in the same PostgreSQL transaction, so a rollback preserves both the source row and the absence of a deletion job.
2. Deletion jobs have no cascading foreign key to `images`; hard deletion cannot erase pending cleanup work. A partial unique index permits only one queued/processing job per bucket/key.
3. The scheduled media Worker claims due jobs with expiring leases and `FOR UPDATE SKIP LOCKED`. Every completion, retry, and permanent-failure transition must present the current claim token, preventing a stale worker from changing a reclaimed job.
4. The Worker accepts only the configured `R2_PRIVATE_BUCKET`, deletes through `ORIGINALS_BUCKET`, and treats an already-absent object as success. Transient failures use exponential backoff with jitter and at most eight recorded attempts.
5. Completed and cancelled jobs are retained for 30 days, then pruned in bounded batches. Failed jobs remain available for investigation.

The deletion trigger and request-time accelerator accept only R2 keys namespaced by the authoritative image UUID. Legacy locator-only draft rows cannot safely authorize private-object deletion and remain on the legacy cleanup path. Request handlers and canonical ingest retain best-effort immediate R2 deletion as latency optimizations, but failure does not lose the durable job. The outbox handles both the prepared source and persisted canonical derivative when applicable; Supabase Storage objects continue through request-time cleanup. Virtual variants are not separate R2 objects and require no object deletion.

Database-first deployment is still preferred, but mixed-version rollout order is safe because request-time R2 cleanup remains in place and repeated R2 deletion is idempotent.

## Virtual Variants And Delivery

1. Successful ingest stores a virtual `images.variants` manifest whose recipes point at the persisted canonical WebP. Paths describe delivery requests, not additional objects written to R2.
2. The Next.js loader (`lib/media/cloudflare-loader.ts`) selects a named width and builds a URL under `NEXT_PUBLIC_MEDIA_CDN_URL`.
3. `static.dev.letsboulder.com` or `static.letsboulder.com` routes the request to the media Worker.
4. For ready public image paths, the Worker prefers `images.optimized_key` and invokes Cloudflare Image Resizing against that private canonical WebP. Legacy ready rows without optimized metadata temporarily resolve to their original until backfill commits a canonical WebP; committed rows never fall back after source deletion.
5. Cloudflare returns and caches the transformed response. No processed image variant is written to the public R2 bucket by the active pipeline.

`GET /origin/<key>` is an internal, secret-protected raw-private-object endpoint. It is not the public image-delivery path.

## Public Map Assets

The Worker's `PUBLIC_BUCKET` binding is distinct from image delivery. Requests under `/maps/*` read objects from the public R2 bucket and support CORS, `HEAD`, and byte ranges for map assets. Do not describe that bucket as the destination for generated image variants.

## Client Upload Queue

`MediaUploadManagerProvider` owns a serial queue backed by the auth-scoped `letsboulder-contributions` IndexedDB database. The prepared, EXIF-stripped JPEG is committed to IndexedDB before network work starts; queue metadata is checkpointed after lifecycle changes and restored on the next authenticated visit. Preview object URLs are regenerated from the stored Blob.

The lifecycle is `QUEUED` -> preprocessing -> presigned upload -> completion/queued ingest -> status polling -> `READY` or `FAILED`. On recovery, the client reconciles a stored image ID with the server before transferring: committed uploads skip the PUT, while unfinished uploads reuse the stable client ID and restart the whole-file PUT with a fresh URL. Browser bytes are removed only after draft attachment or final crag attachment is confirmed. Transfer failures can be retried or deleted; an offline failure pauses the queue, and browser reconnect/page lifecycle events resume eligible work.

Attachment timing differs by target:

- Draft uploads attach to `submission_draft_images` immediately after upload completion has durably queued ingest. Draft attachment therefore does not mean media is ready; draft promotion enforces public deliverability.
- Crag uploads attach through `/api/crags/<cragId>/images/attach` only after polling reports `READY`.

## Metadata And EXIF

- GPS is extracted client-side from the selected original before EXIF-stripped prepared bytes replace it in the durable queue, and is stored in explicit `images` columns when extraction succeeds. The upload contract can also persist a supplied capture date, although the current shared queue initializes that field to null.
- Every supported upload is prepared as a bounded JPEG with EXIF preservation disabled. The prepared source remains private and should still be treated as sensitive despite that client-side stripping request.
- HEIC/HEIF is converted to JPEG in a Web Worker (with a main-thread fallback) before the common JPEG compression step. The source HEIC is not uploaded.
- Public transformed delivery requests set Cloudflare Image Resizing `metadata: 'none'`, which is intended to strip metadata from delivered variants. This repository does not independently verify every Cloudflare format/cache behavior, so do not treat that setting as proof that every delivered response is EXIF-free.

## Moderation Boundary

Media readiness and content moderation are separate concerns. Automated media moderation is disabled: upload and ingest record `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`. The Worker marks media ready/public only after ingest succeeds; user flags, crag reports, route verification, and the legacy moderation queue are documented in `docs/moderation.md`.

Media maintenance crosses private storage and job boundaries. Ingest claims, deletion-job claims/transitions/pruning, and `cleanup_orphan_route_uploads(...)` are `SECURITY DEFINER` RPCs executable only by `service_role` and also reject non-service runtime roles; they are never browser/authenticated-user APIs.

## HEIC Conversion

`features/media-upload/lib/preprocess-image.ts` detects HEIC/HEIF and uses `lib/heic-converter.ts` plus `workers/heic.worker.ts` before all supported inputs pass through the common bounded, EXIF-stripped JPEG preparation.

## Configuration And Secret Mapping

| App / deployment value | Worker value | Purpose |
|---|---|---|
| `R2_S3_ENDPOINT` | R2 bindings are configured in `wrangler.toml` | App-side S3-compatible presigning and object checks |
| `R2_PRIVATE_BUCKET` | `ORIGINALS_BUCKET`; mirrored by Worker var `R2_PRIVATE_BUCKET` | Prepared sources and canonical WebPs in private R2 |
| `R2_PUBLIC_BUCKET` | `PUBLIC_BUCKET`; mirrored by Worker var `R2_PUBLIC_BUCKET` | Public map assets and legacy public objects, not generated variants |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | None; Worker uses R2 bindings | App-side R2 credentials |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Worker custom route / `MEDIA_HOST` | Public media base URL |
| `CF_MEDIA_WORKER_URL` | Worker custom route | Optional fast-path enqueue endpoint |
| `CF_MEDIA_WORKER_SECRET` | Worker secret `INGRESS_SECRET` | Bearer secret for `POST /enqueue`; both sides must contain the same value |
| None in the app runtime | Worker secret `INTERNAL_ORIGIN_SECRET` | `X-Internal-Secret` accepted by `GET /origin/*` |
| None in the app runtime | Worker secret `SUPABASE_SERVICE_ROLE_KEY` | Worker database access; never public |
| None in the app runtime | Worker var `R2_ORIGIN_URL` | Origin hostname used by Cloudflare Image Resizing to fetch private prepared sources and canonical WebPs |

The backfill workflow names its GitHub secrets `CF_MEDIA_WORKER_URL` and `CF_MEDIA_WORKER_SECRET`; the latter is supplied to the Worker's `INGRESS_SECRET` check.
