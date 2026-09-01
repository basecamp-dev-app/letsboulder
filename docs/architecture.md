# Architecture - letsboulder.com

Bouldering topo, route-submission, community, and climbing logbook web app. This document describes deployed responsibilities and state ownership; detailed media and moderation behavior lives in `docs/media-pipeline.md` and `docs/moderation.md`.

## System Topology

```text
Browser
  |-- HTTPS / Server Actions / Route Handlers --> Next.js 16 on Vercel
  |                                                   |
  |                                                   +--> Supabase Auth + PostgreSQL/PostGIS
  |                                                   +--> R2 S3 API (presign/head/delete)
  |
  |-- presigned PUT ------------------------------> private R2 prepared sources
  |-- MapLibre style/tiles -----------------------> OpenFreeMap (or configured style host)
  `-- static.* image/map requests ----------------> Cloudflare media Worker
                                                        |-- Image Resizing fetch -> private R2 origin
                                                        |-- /maps/* -----------> public R2 bucket
                                                        |-- cron/queue --------> Supabase media jobs/images
                                                        |-- canonical WebP ----> private R2
                                                        |-- deletion cron -----> private R2 sources/assets
                                                        `-- optional fast path -> Cloudflare MEDIA_QUEUE

GitHub Actions nightly --> read-only PostgreSQL export login --> dedicated public-data R2 bucket
                              |-- signed immutable dated snapshots
                              `-- latest.json discovery pointer
```

The durable `media_jobs` database outbox is authoritative for media ingest. `media_deletion_jobs` is the transactional outbox for private prepared-source and canonical-object deletion. Cloudflare Queue is an optional low-latency and legacy-backfill ingest transport, not the source of truth.

## Runtime Components

### Web App

- Next.js 16 App Router with React 19 Server Components, Server Actions, and Route Handlers.
- `app/` owns entrypoints and route composition; product behavior generally lives in `features/`, shared UI in `components/`, and cross-feature platform code in `lib/`.
- App-owned UI mutations prefer Server Actions. Route Handlers remain appropriate for upload sessions, public/API integration surfaces, service-worker behavior, and endpoints that need explicit HTTP semantics.
- `lib/media/cloudflare-loader.ts` maps named image widths to the media Worker; it is not evidence of stored image variants.

### Supabase

- PostgreSQL 17 is the authoritative application datastore; PostGIS supports geographic queries.
- Supabase Auth supplies user identities and signed sessions.
- Migrations under `supabase/migrations/` are canonical. `types/database.ts` is generated from the schema.
- Important media/submission RPCs include `queue_media_ingest_job`, `claim_media_job`, `commit_media_webp`, `claim_media_deletion_job`, `create_unified_submission_atomic`, and `promote_draft_to_submission`.
- Community protection and moderation records are database state, but their workflows are separate; see `docs/moderation.md`.

### Media Worker And R2

- `apps/media-worker/` owns cron and queue ingest handlers plus image, origin, and map delivery routes.
- Prepared JPEG sources and canonical WebPs remain private. Ingest writes and verifies a maximum-2560 px, quality-82 canonical WebP; one database transaction switches ready delivery to it, records the virtual manifest, and queues source deletion.
- Virtual variants derive from the canonical WebP through Cloudflare Image Resizing on demand and are cached at delivery; they are not stored variant objects.
- The scheduled Worker drains transactional deletion jobs and removes allowlisted private sources or canonical objects through `ORIGINALS_BUCKET`. Replaced sources remain unclaimable until canonical public delivery has been verified; canonical ingest never deletes them directly.
- The public R2 bucket backs `/maps/*` and legacy public objects. The active Worker does not write generated image variants there.
- Environment routes are `static.dev.letsboulder.com` and `static.letsboulder.com`.

### Vector Maps

- MapLibre GL is the renderer for live maps, location pickers, and static-location views. The app does not use the Mapbox renderer or Mapbox-hosted style as its default.
- `NEXT_PUBLIC_MAP_STYLE_URL` selects a hosted MapLibre-compatible style. The default is OpenFreeMap Liberty at `https://tiles.openfreemap.org/styles/liberty`.
- The world map requests padded viewport data through React Query after debounced movement. Postgres filters canonical spatial rows and returns low-zoom clusters, so the browser does not download or index the global place dataset.
- Offline mode is a pins-only degraded view; it does not claim that the hosted basemap is available offline.
- Public R2 `/maps/*` assets served by the media Worker are a separate storage/delivery concern from the configured OpenFreeMap basemap.

### Public Data Exports

- A protected Production GitHub Actions workflow reads allowlisted public facts through a dedicated read-only PostgreSQL login, produces ODbL JSONL snapshots, and writes them to a dedicated public-data R2 bucket.
- Dated artifacts and signed manifests are immutable; `latest.json` changes only after a complete snapshot is uploaded. This pipeline does not export media or use the Supabase service role.
- Signing, location privacy, retention, consumer verification, and recovery are documented in `docs/open-data-exports.md`. R2 lifecycle policy remains external production configuration.

## Authentication And Request Security

1. The browser Supabase client persists its session in `localStorage`; server clients use request cookies through `@supabase/ssr`. Each runtime must use its own client.
2. Server code establishes identity with `supabase.auth.getUser()` rather than trusting browser-supplied IDs or decoded claims alone.
3. Browser auth changes also scope client query persistence; changing user clears the previous in-memory and persisted query cache.
4. Mutating Route Handlers use the repository API middleware/CSRF flow: `/api/csrf` returns a signed JWT in its JSON body and stores the same value in an HTTP-only cookie. `csrfFetch` echoes the body token in `x-csrf-token`; the server compares both copies, validates the user binding, and applies route-specific auth/rate limits.
5. Server Actions establish their own server-side auth context and do not use `csrfFetch`.
6. `proxy.ts` strips `x-internal-user-id`; no trusted client-header authentication fallback exists.

The CSRF cookie is not the Supabase session. See `docs/auth-security.md` for the complete rules.

## State Ownership

| State | Owner | Lifetime / persistence |
|---|---|---|
| Users, crags, routes, drafts, media metadata, jobs, reports | Supabase/PostgreSQL | Authoritative durable state |
| Authentication session | Supabase Auth | Browser `localStorage`; request cookies for server clients |
| Remote query cache | TanStack React Query | In memory; only queries with `meta.persist = true` are persisted to auth-scoped IndexedDB for up to 12 hours; community queries are excluded |
| Route drawing/editor history and selection | Feature-owned Zustand store in `features/route-editor/store/` | Client memory for the mounted editor; server/database data remains authoritative |
| Prepared upload bytes, queue metadata, progress, retry/polling state | `MediaUploadManagerProvider` plus auth-scoped IndexedDB | Exact prepared Blob and checkpoints survive reload; active control state is reconstructed in memory |
| User-selected public crag packs | `features/offline/lib/offline-pack-*` | Device-local IndexedDB metadata and download checkpoints plus immutable Cache API media; survives auth changes |
| Local form/view state | Owning React component or feature hook | Client memory unless explicitly submitted or cached |

Do not put server truth into Zustand or infer durable upload recovery from React Query persistence.

## Storage Matrix

| Store | Visibility | Contents | Access path |
|---|---|---|---|
| Supabase PostgreSQL | RLS/service-role controlled | Product records, media metadata, durable outbox, moderation and verification state | Supabase clients/RPCs |
| Private R2 bucket | Private | Prepared JPEG sources and persisted canonical WebPs; replaced sources may already be deleted | Browser presigned PUT; app object checks; Worker binding/private origin |
| Public R2 bucket | Public through controlled routes | `/maps/*` assets and legacy public objects | Worker `PUBLIC_BUCKET`; not the active image-variant destination |
| Public-data R2 bucket | Public bulk download | Signed, immutable ODbL snapshots and mutable discovery metadata | Nightly GitHub Actions export; separate credentials and lifecycle policy |
| Cloudflare edge cache | Public delivery cache | On-demand resized image responses | `static.*` Worker route and Image Resizing |
| Browser IndexedDB | Per browser; store-specific auth policy | Auth-scoped React Query cache and exact prepared upload Blobs/checkpoints plus device-local public crag-pack versions, ownership, and resumable jobs | Query persister, upload store, and offline pack database |
| Browser Cache API | Per browser | Versioned offline shells, immutable Next assets, and shared immutable crag-pack media | Service worker and offline pack manager |
| Browser memory/blob URLs | Page/provider local | Selected upload files, previews, queue state, editor state | React context/hooks/Zustand |

## Primary Data Flows

### Media Upload

1. The browser extracts GPS from the selected original while preparing an EXIF-stripped JPEG bounded to 3200 px, 3 MiB, and initial quality 0.88, then persists those exact bytes before network work.
2. Authenticated browser creates a session through `POST /api/media/upload-sessions`.
3. The Route Handler creates a private/pending `images` row and returns a presigned private-R2 PUT.
4. Browser uploads the persisted prepared bytes directly, then calls the upload-session completion Route Handler.
5. Completion verifies the object and atomically queues durable ingest; optional Worker enqueue is only a best-effort fast path.
6. Worker queue or cron processing writes and verifies the private canonical WebP before `commit_media_webp` atomically switches delivery and queues `source_replaced` deletion.
7. The Worker verifies the switched canonical URL through the public media hostname, arms the source-replacement deletion job, and lets the deletion outbox remove the original independently. Public requests resize the canonical WebP on demand.

### Media Deletion

1. Canonical commit queues the prepared source as `source_replaced`; database deletion and tombstone triggers independently snapshot valid original and canonical R2 locators into `media_deletion_jobs` and cancel active ingest in the same transaction as the mutation.
2. The outbox survives hard deletion of source rows and deduplicates active work by bucket/key.
3. Worker cron claims deletion jobs under an expiring tokenized lease, deletes idempotently through the private R2 binding, and records completion or retry. Completing `source_replaced` records confirmed source deletion without clearing its provenance locator.
4. Legacy Supabase Storage cleanup remains request-time; the deletion outbox is intentionally R2-only.

### Route Submission

- Direct submission supports `new`, `existing`, and `crag_image` image modes through the thin submission Route Handler and feature-owned validation/executors.
- New-image publication requires each upload-session image to be publicly deliverable, then `create_unified_submission_atomic` creates/associates the image, crag-image, climb, and route-line records transactionally.
- Existing-image and crag-image modes add route data against an existing eligible image rather than creating a replacement media object.
- Drafts are durable `submission_drafts` with separately attached image records and optimistic `updated_at` conflict handling. Explicit editor Save commits dirty route replacements, image state, metadata, and crag selection through one RPC; the 400 ms shared-location patch remains a separate boundary. `promote_draft_to_submission` performs publication; attaching an upload to a draft before ingest is ready does not bypass promotion readiness checks.
- Route geometry is edited with the Canvas-based route editor and feature-owned Zustand state, then persisted through submission/draft operations.
- Community verification is post-publication: `climb_verifications` reaches community-verified status at three votes. It is not upload moderation or a prerequisite imposed by the media pipeline.

### Moderation And Reports

Automated media moderation is disabled and no AWS Rekognition integration is active. Media readiness, crag reports, submission review, metadata proposals, and community route verification are independent workflows. See `docs/moderation.md`.

## Network Resilience

The approved target for offline field use is the installed iOS and Android PWA contract in [Offline Field Guide Product Contract](offline-product-contract.md). The bullets below describe the current deployed implementation; they do not imply that it already meets every target acceptance criterion.

- The app is online-first. HTTP caching and React Query handle normal revisits; selected queries opt into IndexedDB persistence.
- `/offline` is both the navigation fallback and the saved-guide library; `/offline/library` remains a compatible library URL, while `/offline/crag?id=UUID` provides the standalone viewer over installed IndexedDB metadata and immutable cached media. `public/sw.js` precaches those shells and their Next static assets, serves saved-guide navigations cache-first, and persists the build-cache manifest across worker restarts.
- `GET /api/offline-packs/crags/{cragId}/manifest` returns a deterministic, ETagged snapshot containing only active public routes, publicly deliverable image metadata, route-line geometry, policy-filtered coordinates, and fixed-format immutable media URLs.
- The foreground pack manager validates and stages a complete metadata version, downloads only media absent from the shared Cache API cache, checkpoints each asset, atomically advances the IndexedDB active-version pointer, and then garbage-collects unowned old media. An interrupted update never replaces the active version.
- Recovery runs at startup, reconnect, and foreground return. Permanent validation failures are not retried automatically; active packs with evicted media remain usable as degraded guides until explicitly repaired. Legacy child-manifest wrappers are read compatibly, while new payloads must be readable before staging. Crag packs are the only standalone offline product: child climb manifests are internal installation dependencies, and a failed update never replaces the active version.
- Offline status surfaces verify same-origin reachability with the uncached `/api/connectivity` probe instead of treating `navigator.onLine` as authoritative, and expose explicit library and online-app navigation.
- Crag packs are public device-local content and survive sign-out. Personal logbook and account data remain in their existing auth-scoped stores and are not included in manifests.
- Offline maps intentionally expose downloaded coordinates as pins-only context. Hosted OpenFreeMap styles and the retirement-only raster proxy are not downloadable pack assets.
- Contribution uploads persist auth-scoped Blobs and server checkpoints in IndexedDB before transfer. Reload/reconnect recovery reuses a stable server image session; unfinished whole-file PUTs restart, while database-committed uploads skip transfer.

## Module Boundaries

- `app/`: route entrypoints, route-local wrappers, and route-level composition.
- `features/`: product-domain components, hooks, actions, server orchestration, validation, and types.
- `components/`: shared shell and reusable UI, especially `components/ui/`.
- `lib/`: cross-feature technical utilities and platform integrations.
- `hooks/`: cross-feature generic hooks only; domain hooks belong in their feature.
- `store/`: shared app-wide stores only; feature state belongs under the owning feature.

Features must not import route composition from `app/**` through alias or relative static imports, dynamic imports, or CommonJS `require()`. Shared components and cross-feature consumers use the owning feature's curated public surface; `app/` remains the composition layer and may select feature implementation modules directly. Submission and draft Route Handlers stay thin; feature server modules own validation, orchestration, and response shaping.

Features with both browser-safe and server behavior expose separate `public-client.ts`, `public-actions.ts`, and `public-server.ts` contracts as needed. Generic `public.ts` and `public-client.ts` contracts are checked transitively for client safety; valid `'use server'` modules terminate that traversal. Server orchestration normally resides under `server/`; modules under `actions.ts` or `actions/` are explicit Server Action entrypoints rather than exceptions hidden inside client barrels.

## Key Files

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout and providers |
| `components/QueryProviders.tsx` | Auth-scoped React Query cache and selective persistence |
| `lib/supabase.ts` | Browser Supabase client |
| `lib/supabase-server.ts` | Request/server Supabase clients |
| `lib/csrf.ts`, `lib/csrf-server.ts` | Route Handler CSRF flow |
| `lib/rate-limit-config.ts` | Named API rate-limit configuration (15 tiers; operational values remain code-owned) |
| `app/api/media/upload-sessions/` | Upload session create/status/complete/delete HTTP surface |
| `lib/media/r2.ts` | App-side R2 presigning and object operations |
| `apps/media-worker/src/index.ts` | Durable ingest and virtual image/map delivery |
| `.github/workflows/public-data-export-nightly.yml` | Protected nightly public-data snapshot publication |
| `lib/map/vector-map-config.ts` | MapLibre style selection and offline mode |
| `features/media-upload/` | In-memory client upload queue and attachment lifecycle |
| `features/route-editor/` | Canvas editor and feature-owned Zustand state |
| `features/submissions/server/` | Direct submission, draft, collaboration, and promotion orchestration |
| `supabase/migrations/` | Canonical database schema history |
| `types/database.ts` | Generated Supabase database types |
