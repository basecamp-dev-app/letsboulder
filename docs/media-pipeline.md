# Media Pipeline

## Upload And Ingest

1. The client reads GPS from the selected original `File` while preparing a JPEG with `browser-image-compression`: maximum width or height 3200 px, maximum size 3 MiB, initial quality 0.88, `image/jpeg`, and `preserveExif: false`. HEIC/HEIF is converted to JPEG before this bounded compression. GPS therefore comes from the source before its metadata is discarded, not from the stripped upload.
2. Before network work starts, the client stores the prepared JPEG and queue metadata in auth-scoped IndexedDB. The same prepared `File` instance is measured, declared to the upload-session API, and sent to R2; recovery reconstructs a `File` from those persisted exact bytes instead of preprocessing the selected source again.
3. The authenticated client calls the `POST /api/media/upload-sessions` Route Handler. The request identifies a `draft_image`, `crag_image`, or `submission_image` and includes prepared dimensions plus client-extracted capture/GPS data when available.
4. The Route Handler creates the authoritative `images` row as private/pending and returns a presigned R2 `PUT` URL from `createPrivateUploadUrl()` (`lib/media/r2.ts`, 15-minute TTL). The auth-scoped `clientUploadId` is unique per user, so replaying session creation recovers the same image row and renews the signed URL.
5. The browser uploads the prepared JPEG directly to the private R2 bucket. The app server does not proxy the bytes.
6. The client calls `POST /api/media/upload-sessions/<imageId>/complete`. The handler verifies ownership and that the private object exists.
7. `finalize_media_upload(...)` atomically commits the immutable original locator and invokes `queue_media_ingest_job(...)`, which changes the image to queued and inserts or reuses a durable `media_jobs` row. This database outbox is the source of truth and finalization is replay-safe. If the immutable copy succeeded but finalization failed, the completion route enqueues delayed `upload_finalize_failed` compensation; a successful retry cancels queued compensation while holding the authoritative image and deletion-job locks.
8. If `CF_MEDIA_WORKER_URL` and `CF_MEDIA_WORKER_SECRET` are configured, completion also best-effort calls Worker `POST /enqueue`. That Cloudflare Queue path reduces latency but is optional; its failure does not invalidate the durable job.
9. The Worker queue consumer treats the fast path as a wake-up hint, claims the matching durable job with a fenced lease token, and processes the authoritative database payload. Its scheduled handler uses the same claim path to recover durable work, with retry/backoff and terminal failure recorded in `media_jobs`.

## Canonical WebP Commit

1. Ingest validates that the job locator still matches the image's immutable original locator and that the source exists in the configured private bucket.
2. Cloudflare Image Resizing reads that source and produces a scale-down WebP at maximum width 2560 px and quality 82. WebP output does not retain EXIF metadata; request-time delivery also explicitly sets `metadata: 'none'`.
3. The Worker hashes the returned bytes, writes them as `images/assets/<image UUID>/<SHA-256>/canonical.webp` in the same private R2 bucket, then verifies the stored size and `image/webp` content type.
4. Only after verification does service-only `commit_media_webp(...)` lock the image and atomically store the canonical locator and dimensions, virtual manifest, URL, and ready/public state; switch linked draft/public delivery locators to the canonical WebP; recover a missing draft link only for a unique exact locator with a draft owner/collaborator ownership match; and enqueue the old source in `media_deletion_jobs` with reason `source_replaced`.
5. The Worker then performs an anonymous `GET` through the production media hostname and requires a non-empty image response. Only `verify_media_replacement_delivery(...)` records that proof on the deletion job, and both canonical commit and verification require the active ingest claim token. Unverified source-replacement jobs cannot be claimed, and canonical ingest never deletes the source directly.

The canonical WebP is the persisted delivery source, not a transient response and not a public-bucket object. `original_bucket` and `original_key` remain immutable provenance after the switch, but callers must not assume that object still exists. `media_deletion_jobs.delivery_verified_at` gates source replacement cleanup, while the image lifecycle timestamps distinguish deletion queued from deletion confirmed; scheduled completion records `original_deleted_at` after an idempotent delete.

Failure ordering is deliberate. A resize, canonical write, or object verification failure leaves the image uncommitted to canonical ready delivery and does not request source deletion. A commit failure also leaves the source in place; the immutable content-addressed canonical write may be orphaned temporarily and a retry overwrites the same key for the same bytes. A public-delivery failure leaves the source-replacement job blocked for retry. Image deletion separately queues any valid original and canonical locators, so cleanup does not depend on either object still being present. Prepared staging replacement cleanup is also recorded in the deletion outbox; no application route directly deletes private media.

## Transactional Media Deletion

1. Image tombstones and hard deletes capture the private R2 bucket/key in `media_deletion_jobs` before the authoritative `images` row changes. This covers account, published-submission, linked-draft-image, and unassociated-upload deletion. The trigger insert participates in the same PostgreSQL transaction, so a rollback preserves both the source row and the absence of a deletion job.
2. Deletion jobs have no cascading foreign key to `images`; hard deletion cannot erase pending cleanup work. A partial unique index permits only one queued/processing job per bucket/key.
3. The scheduled media Worker claims due jobs with expiring leases and `FOR UPDATE SKIP LOCKED`. Every completion, retry, and permanent-failure transition must present the current claim token, preventing a stale worker from changing a reclaimed job.
4. The Worker accepts only the configured `R2_PRIVATE_BUCKET`, deletes through `ORIGINALS_BUCKET`, and treats an already-absent object as success. Transient failures use exponential backoff with jitter and at most eight recorded attempts.
5. Completed and cancelled jobs are retained for 30 days, then pruned in bounded batches. Failed jobs remain available for investigation.

Ingest leases expire after a bounded interval. A new Worker may reclaim an expired lease with a new claim token, while every completion, retry, failure, canonical commit, and delivery verification rejects stale tokens. Terminal failures are surfaced to lifecycle health and require explicit reviewed recovery; objects are never deleted merely because they are old. Lifecycle health reports a failed ingest as informational only when a linked replay completed or the image is canonical-ready and its original deletion completed. Other terminal failures and invariant violations remain immediately critical, while active work warns after 30 minutes and becomes critical after 6 hours. Generic recovery is capped at 25 jobs and excludes reconciled-orphan deletion work, which continues to require a fresh reconciliation artifact.

The deletion trigger and Worker accept only R2 keys namespaced by the authoritative image UUID. Legacy locator-only draft rows cannot safely authorize private-object deletion and remain on the legacy cleanup path. Canonical ingest relies exclusively on the verified durable outbox for replaced-source deletion. The outbox handles both the prepared source and persisted canonical derivative when applicable; Supabase Storage objects continue through request-time cleanup. Virtual variants are not separate R2 objects and require no object deletion.

Production maintenance uses `media-reconciliation.yml` to classify every R2 object across authoritative locators, draft/crag references, ingest jobs, deletion jobs, and historical public-schema text/JSON surfaces. Missing-object findings are limited to live content and active ingest work; historical failed ingest jobs, inactive drafts/images, and deletion targets remain visible as surfaces without being treated as objects that must still exist. `media-canonical-migration.yml` accepts only live candidates from a fresh reconciliation, transforms at most 25 sources per run with Sharp, verifies public delivery before and after the atomic switch, and restores the captured database state if post-commit delivery fails. `media-orphan-enqueue.yml` accepts a reviewed reconciliation run and digest, revalidates at most 25 absent-image original namespaces, and calls only the durable `reconciled_orphan` enqueue RPC. Active orphan jobs reserve their image UUID and locator against new public-schema writes; the Worker repeats the reference scan and verifies the reviewed R2 size/ETag immediately before deletion. The scheduled Worker remains the sole object deleter. Uncertain candidates remain in place and are recorded in the retained-quarantine manifest.

`production-media-remediation.yml` handles artifact-bound incident cleanup in batches of at most 25. Missing live image and draft references are rechecked with R2 `HEAD` requests and then reversibly quarantined (`private`/`failed`) without deleting route geometry. Canonical replacements stranded between database commit and delivery verification are checked through the public CDN before their existing source-deletion jobs are released. Possible orphans are metadata-revalidated and enqueued through the same durable deletion worker; the remediation command never deletes R2 objects directly. Quarantined rows and their pre-change snapshots are recorded in `media_quarantine_events` with the reviewed health run and artifact digest.

`production-media-lifecycle-automation.yml` runs hourly in `observe` mode and can be dispatched in protected `apply` mode. Each run creates reconciliation and health evidence at the checked-out commit, hashes the exact health bytes, and stores selections, validation outcomes, blocked URLs/errors, worker follow-up, and before/after summaries in one schema-versioned artifact. Missing references and possible orphans require two identical observations at least one hour apart; source replacements are independently revalidated on every run. Apply requires `APPLY_MEDIA_LIFECYCLE_RECOVERY`, remains subject to the `Production` environment approval, and processes at most 25 candidates per category. The known blocked image `e9c0ce67-507d-42ec-8311-697ce1649aac` is always retained for separate repair even if delivery later begins responding.

Operator runbook: review the latest `production-media-lifecycle-automation-<run ID>` artifact first. A failed observe run means at least one `blocked` entry needs attention; its record includes the candidate identity, object key, public URL/status when applicable, and timestamp. After resolving the underlying exception, manually dispatch `observe` and confirm that the candidate validates. To apply eligible routine recovery, dispatch `apply`, set a batch size from 1 to 25, enter the exact confirmation phrase, approve the `Production` environment, and review `workerFollowUp` plus `healthAfter`. Use `production-media-remediation.yml` when an operator needs the original artifact-bound break-glass path.

These maintenance workflows default to `dry_run=true`. Dry runs use read-only database transactions, revalidate inputs and reviewed artifacts, and write manifests without enqueueing jobs, invoking recovery RPCs, downloading or uploading canonical media, or changing database rows. A maintainer must explicitly provide the exact confirmation phrase and set `dry_run=false` for a reviewed mutation. Workflow inputs also bind source run IDs, artifact digests, deployment runs, and the executing commit SHA; mismatches stop before mutation. Result artifacts are schema-versioned, contain operational metadata rather than credentials, and are written with restrictive file permissions before upload.

`production-media-http-health.yml` establishes or compares an immutable anonymous-GET baseline for public image URLs, identity detail/topo recipes, and active linked/source crag image URLs. Mutating orphan batches consume a reviewed baseline artifact and fail on any new non-200, non-image, or empty response. Private and public R2 inventories are separate read-only workflows; orphan maintenance never addresses `lb-prod-media-public`.

Database-first deployment is still preferred, but mixed-version rollout order is safe because request-time R2 cleanup remains in place and repeated R2 deletion is idempotent.

## Virtual Variants And Delivery

1. Successful ingest stores a virtual `images.variants` manifest whose recipes point at the persisted canonical WebP. Paths describe delivery requests, not additional objects written to R2.
2. The Next.js loader (`lib/media/cloudflare-loader.ts`) selects a named width and builds a URL under `NEXT_PUBLIC_MEDIA_CDN_URL` only for public Worker paths. Authenticated `/api/media/*` URLs stay on the app route and are never rewritten to the public Worker.
   The application Content Security Policy derives the exact browser media origin from the same configured URL, so isolated staging and production media hostnames remain usable without broad wildcard access.
3. `static.dev.letsboulder.com` or `static.letsboulder.com` routes the request to the media Worker.
4. For ready public image paths, the Worker prefers `images.optimized_key` and invokes Cloudflare Image Resizing against that private canonical WebP. Legacy ready rows without optimized metadata temporarily resolve to their original until backfill commits a canonical WebP; committed rows never fall back after source deletion.
5. Cloudflare returns and caches the transformed response. The Worker Cache is enabled and transformed responses use stable named widths, `format=auto`, and immutable URLs. No processed image variant is written to the public R2 bucket by the active pipeline.
6. Offline pack manifests include only ready public images with a complete canonical optimized WebP tuple. They retain versioned CDN variant URLs for downloads; original locators are provenance and are never used for offline eligibility.

`GET /origin/<key>` is an internal, secret-protected raw-private-object endpoint. It is not the public image-delivery path.

Query-style Worker delivery paths are additionally matched to an exact ready, approved, public `images` locator. They cannot deliver a private bucket/key. Private image transformations remain on authenticated Next media routes until the Worker has a browser-safe signed authorization protocol.

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
- Public transformed delivery requests set Cloudflare Image Resizing `metadata: 'none'`, which strips invisible metadata from JPEG output; WebP and other non-JPEG outputs discard metadata by format. This repository does not independently verify every Cloudflare format/cache behavior, so do not treat that setting as proof that every delivered response is EXIF-free.

## Transformation Budget And Monitoring

The Cloudflare Images Free plan currently includes 5,000 unique transformations per calendar month. A unique transformation is a source image plus its transformation parameters; repeat requests for the same source and parameters count once during that month. `format=auto` counts as one transformation even when Cloudflare negotiates AVIF for some clients and WebP for others. New transformations return error 9422 after the allowance is exhausted, while cached responses continue to work.

The application bounds production delivery to five named widths: 240, 640, 1280, 2048, and 2560 pixels. The planning upper bound is one canonical ingest transformation plus five delivery transformations per source. Actual usage depends on how many sources receive each variant and whether the monthly cache is warm.

Monitor the Cloudflare Images transformation metric and 9422 responses monthly, and use Worker observability logs to track transform failures and raw fallbacks. Monitor cache hit ratio for `static.letsboulder.com` and verify `Vary: Accept`, immutable cache headers, negotiated content types, non-empty image responses, and representative mobile/desktop sizes after deployment. Roll back by redeploying the prior Worker and application versions; the immutable canonical WebPs remain valid delivery sources.

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

## R2 Inventory Credentials

The manual private and public inventory workflows use actual R2 S3 API credentials, not Cloudflare API tokens or values derived from them. Configure these secrets in the protected GitHub `Production` environment:

| Workflow | Access key secret | Secret access key secret | Required scope |
|---|---|---|---|
| `r2-inventory.yml` | `R2_PRIVATE_INVENTORY_ACCESS_KEY_ID` | `R2_PRIVATE_INVENTORY_SECRET_ACCESS_KEY` | Object read/list only on `lb-prod-media-private` |
| `r2-public-inventory.yml` | `R2_PUBLIC_INVENTORY_ACCESS_KEY_ID` | `R2_PUBLIC_INVENTORY_SECRET_ACCESS_KEY` | Object read/list only on `lb-prod-media-public` |

Provision separate credentials for each bucket and grant no write, delete, or account-wide permissions. Each workflow validates the account ID and performs a non-mutating bucket listing before writing its existing inventory artifact. Missing or invalid credentials fail the workflow before an artifact is uploaded. Rotate these credentials outside the repository and revoke any credential that was reused for another purpose.
