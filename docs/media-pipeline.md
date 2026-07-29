# Media Pipeline

## Upload And Ingest

1. The authenticated client calls the `POST /api/media/upload-sessions` Route Handler. The request identifies a `draft_image`, `crag_image`, or `submission_image` and includes dimensions plus client-extracted capture/GPS data when available.
2. The Route Handler creates the authoritative `images` row as private/pending and returns a presigned R2 `PUT` URL from `createPrivateUploadUrl()` (`lib/media/r2.ts`, 15-minute TTL). The auth-scoped `clientUploadId` is unique per user, so replaying session creation recovers the same image row and renews the signed URL.
3. The browser uploads directly to the private R2 bucket. The app server does not proxy the bytes.
4. The client calls `POST /api/media/upload-sessions/<imageId>/complete`. The handler verifies ownership and that the private object exists.
5. `finalize_media_upload(...)` atomically commits the immutable locator and invokes `queue_media_ingest_job(...)`, which changes the image to queued and inserts or reuses a durable `media_jobs` row. This database outbox is the source of truth and finalization is replay-safe.
6. If `CF_MEDIA_WORKER_URL` and `CF_MEDIA_WORKER_SECRET` are configured, completion also best-effort calls Worker `POST /enqueue`. That Cloudflare Queue path reduces latency but is optional; its failure does not invalidate the durable job.
7. The Worker queue consumer handles the fast path. Its scheduled handler uses its service-role client to call service-only `claim_media_job(worker_name)` and recover durable work, with retry/backoff and terminal failure recorded in `media_jobs`.

Originals remain in `lb-dev-media-private` or `lb-prod-media-private`. Ingest currently validates the object and publishes delivery metadata; it does not copy the original or pre-render image files.

## Transactional Original Deletion

1. Image tombstones and hard deletes capture the private R2 bucket/key in `media_deletion_jobs` before the authoritative `images` row changes. This covers account, published-submission, linked-draft-image, and unassociated-upload deletion. The trigger insert participates in the same PostgreSQL transaction, so a rollback preserves both the source row and the absence of a deletion job.
2. Deletion jobs have no cascading foreign key to `images`; hard deletion cannot erase pending cleanup work. A partial unique index permits only one queued/processing job per bucket/key.
3. The scheduled media Worker claims due jobs with expiring leases and `FOR UPDATE SKIP LOCKED`. Every completion, retry, and permanent-failure transition must present the current claim token, preventing a stale worker from changing a reclaimed job.
4. The Worker accepts only the configured `R2_PRIVATE_BUCKET`, deletes through `ORIGINALS_BUCKET`, and treats an already-absent object as success. Transient failures use exponential backoff with jitter and at most eight recorded attempts.
5. Completed and cancelled jobs are retained for 30 days, then pruned in bounded batches. Failed jobs remain available for investigation.

The deletion trigger and request-time accelerator accept only canonical R2 keys namespaced by the authoritative image UUID. Legacy locator-only draft rows cannot safely authorize private-object deletion and remain on the legacy cleanup path. Request handlers retain best-effort R2 deletion as a rollout-safe latency optimization, but failure does not lose the durable job. The outbox currently handles R2 originals only; Supabase Storage objects continue through request-time cleanup. Virtual variants are not separate R2 objects and require no object deletion.

Database-first deployment is still preferred, but mixed-version rollout order is safe because request-time R2 cleanup remains in place and repeated R2 deletion is idempotent.

## Virtual Variants And Delivery

1. Successful ingest stores a virtual `images.variants` manifest. Paths such as `images/<upload-id>/v1/detail.jpeg` describe delivery requests, not objects written to R2.
2. The Next.js loader (`lib/media/cloudflare-loader.ts`) selects a named width and builds a URL under `NEXT_PUBLIC_MEDIA_CDN_URL`.
3. `static.dev.letsboulder.com` or `static.letsboulder.com` routes the request to the media Worker.
4. The Worker maps either a virtual variant path or an explicit `?variant=...` request back to the private original and invokes Cloudflare Image Resizing through `fetch(..., { cf: { image: ... } })`.
5. Cloudflare returns and caches the transformed response. No processed image variant is written to the public R2 bucket by the active pipeline.

`GET /origin/<key>` is an internal, secret-protected raw-original endpoint. It is not the public image-delivery path.

## Public Map Assets

The Worker's `PUBLIC_BUCKET` binding is distinct from image delivery. Requests under `/maps/*` read objects from the public R2 bucket and support CORS, `HEAD`, and byte ranges for map assets. Do not describe that bucket as the destination for generated image variants.

## Client Upload Queue

`MediaUploadManagerProvider` owns a serial queue backed by the auth-scoped `letsboulder-contributions` IndexedDB database. A selected `File` is committed to IndexedDB before network work starts; queue metadata is checkpointed after lifecycle changes and restored on the next authenticated visit. Preview object URLs are regenerated from the stored Blob.

The lifecycle is `QUEUED` -> preprocessing -> presigned upload -> completion/queued ingest -> status polling -> `READY` or `FAILED`. On recovery, the client reconciles a stored image ID with the server before transferring: committed uploads skip the PUT, while unfinished uploads reuse the stable client ID and restart the whole-file PUT with a fresh URL. Browser bytes are removed only after draft attachment or final crag attachment is confirmed. Transfer failures can be retried or deleted; an offline failure pauses the queue, and browser reconnect/page lifecycle events resume eligible work.

Attachment timing differs by target:

- Draft uploads attach to `submission_draft_images` immediately after upload completion has durably queued ingest. Draft attachment therefore does not mean media is ready; draft promotion enforces public deliverability.
- Crag uploads attach through `/api/crags/<cragId>/images/attach` only after polling reports `READY`.

## Metadata And EXIF

- GPS is extracted client-side before upload and stored in explicit `images` columns when extraction succeeds. The upload contract can also persist a supplied capture date, although the current shared queue initializes that field to null.
- Non-HEIC files are uploaded without a client re-encode, so their private original bytes may retain EXIF. Private originals must therefore be treated as sensitive.
- HEIC/HEIF is converted to JPEG in a Web Worker (with a main-thread fallback). The source HEIC is not uploaded, and EXIF retention in the converted JPEG is not guaranteed.
- Public transformed delivery requests set Cloudflare Image Resizing `metadata: 'none'`, which is intended to strip metadata from delivered variants. This repository does not independently verify every Cloudflare format/cache behavior, so do not treat that setting as proof that every delivered response is EXIF-free.

## Moderation Boundary

Media readiness and content moderation are separate concerns. Automated media moderation is disabled: upload and ingest record `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`. The Worker marks media ready/public only after ingest succeeds; user flags, crag reports, route verification, and the legacy moderation queue are documented in `docs/moderation.md`.

Media maintenance crosses private storage and job boundaries. Ingest claims, deletion-job claims/transitions/pruning, and `cleanup_orphan_route_uploads(...)` are `SECURITY DEFINER` RPCs executable only by `service_role` and also reject non-service runtime roles; they are never browser/authenticated-user APIs.

## HEIC Conversion

`features/media-upload/lib/preprocess-image.ts` detects HEIC/HEIF and uses `lib/heic-converter.ts` plus `workers/heic.worker.ts` to produce the JPEG that is uploaded. Other supported files are uploaded unchanged.

## Configuration And Secret Mapping

| App / deployment value | Worker value | Purpose |
|---|---|---|
| `R2_S3_ENDPOINT` | R2 bindings are configured in `wrangler.toml` | App-side S3-compatible presigning and object checks |
| `R2_PRIVATE_BUCKET` | `ORIGINALS_BUCKET`; mirrored by Worker var `R2_PRIVATE_BUCKET` | Private originals |
| `R2_PUBLIC_BUCKET` | `PUBLIC_BUCKET`; mirrored by Worker var `R2_PUBLIC_BUCKET` | Public map assets and legacy public objects, not generated variants |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | None; Worker uses R2 bindings | App-side R2 credentials |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Worker custom route / `MEDIA_HOST` | Public media base URL |
| `CF_MEDIA_WORKER_URL` | Worker custom route | Optional fast-path enqueue endpoint |
| `CF_MEDIA_WORKER_SECRET` | Worker secret `INGRESS_SECRET` | Bearer secret for `POST /enqueue`; both sides must contain the same value |
| None in the app runtime | Worker secret `INTERNAL_ORIGIN_SECRET` | `X-Internal-Secret` accepted by `GET /origin/*` |
| None in the app runtime | Worker secret `SUPABASE_SERVICE_ROLE_KEY` | Worker database access; never public |
| None in the app runtime | Worker var `R2_ORIGIN_URL` | Origin hostname used by Cloudflare Image Resizing to fetch private originals |

The backfill workflow names its GitHub secrets `CF_MEDIA_WORKER_URL` and `CF_MEDIA_WORKER_SECRET`; the latter is supplied to the Worker's `INGRESS_SECRET` check.
