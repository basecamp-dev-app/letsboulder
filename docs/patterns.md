# Climbing Patterns - letsboulder.com

This guide captures implementation patterns and edge cases for climbing-related features.

Use this as a reference when adding or changing route drawing, map, media, GPS, or offline behavior.

## 0. UI Visual Language

### Pattern
- Preserve the current rounded letsboulder visual language across app-owned UI.
- Follow nearby screen and shared component radius patterns instead of introducing a new hard-edge system.
- Keep intentionally circular affordances such as avatars, map pins, status dots, and cluster markers circular.

### Known Edge Cases
- **Global radius assumptions:** `app/globals.css` currently uses a rounded radius token; do not assume `--radius: 0`.
- **Mixed surfaces:** Cards, dialogs, inputs, chips, and overlays may use different rounded scales; match local context before normalizing.

---

## 1. Route Canvas Drawing

### Pattern
- `useRouteStore` is the interactive editor state owner. Its canvas slice owns routes, selection, drawing points, mode/tool, and zoom; its editor slice owns the metadata draft and panel intent; its history slice owns undo/redo snapshots.
- A screen that also owns persisted or saveable routes must synchronize explicitly. `use-published-route-editor-sync.ts` seeds Zustand when the active image or owner snapshot changes, suppresses the resulting echo, and then copies subsequent store edits back to the owner.
- Compare serialized route content, not array identity, when deciding whether either side changed. This prevents seed/write loops and ignores fields that are not persisted.
- Call `clearCanvasState()` when switching images or reseeding one editor session. It clears routes, selection, editor draft, and history while preserving mode, interaction tool, and zoom.
- Call `reset()` when leaving/unmounting the editor. It additionally restores `mode: 'browse'`, `interactionTool: 'select'`, and the identity zoom transform.
- Do not treat Zustand as durable storage. Explicit draft Save sends dirty route sets with image state and metadata through `/api/submissions/drafts/[id]`, which commits them in one concurrency-checked transaction; the separate draft-routes endpoint remains a legacy compatibility surface. Published-image edits remain in their screen owner until explicitly saved through `apply_published_submission_edit`.
- Published saves use one client mutation UUID per stable operation payload. Retry the same payload with the same UUID after an ambiguous failure; a changed payload receives a new UUID. The returned route mappings replace temporary canvas IDs, `commitId` identifies the grouped immutable entity revisions, and `wiki_revision` remains the editor's compatibility conflict token until entity-head UUIDs replace it.
- Submission-local saves never mutate shared crag taxonomy. Existing crag name, region, and sub-area corrections use `propose_crag_metadata`; approval requires a different scoped crag maintainer or moderator and atomically advances the immutable crag head.
- Durable history belongs to `wiki_revision_commits`, `wiki_entity_revisions`, and `wiki_entity_heads`, not the Zustand undo stack or `submission_edit_history`. Rollback appends a revision from a prior canonical snapshot and must compare the expected head UUID.

### Key Files
- `features/route-editor/components/UnifiedRouteCanvas.tsx` — main canvas component
- `features/route-editor/hooks/useRouteDrawing.ts` — route drawing state and point management
- `features/route-editor/hooks/useHitTesting.ts` — hit testing for selecting/editing route points
- `features/route-editor/store/` — composed Zustand canvas, editor, and history slices
- `features/submissions/submission-editor/hooks/use-published-route-editor-sync.ts` — published editor owner/store synchronization
- `lib/route-renderer.ts` — canvas rendering (Path2D, DPR-aware)
- `lib/canvasMath.ts` — coordinate transforms and math utilities
- `types/domain.ts` — `RoutePoint`, `RouteLine`, `DrawingRoute`, `CanvasDimensions`

### Known Edge Cases
- **High DPI displays:** Scale canvas by `window.devicePixelRatio` or lines will appear blurry
- **Touch vs Mouse:** `useRouteDrawing` handles both `touchstart`/`touchmove` and `mousedown`/`mousemove`
- **Resize:** Use `useContainerSize` hook; redraw on orientation change
- **Context loss:** Path2D stores route geometry; redraw on `visibilitychange` event
- **CSS layering:** Canvas is layered via CSS (decoupled from image rendering) — see `db0a1ee` refactor

---

## 2. MapLibre Maps and Clustering

### Pattern
- Use `MapLibreVectorMap` for interactive maps and its location-picker/static wrappers for those specialized cases. The primitive owns MapLibre's imperative lifecycle and updates GeoJSON sources when React props change.
- Resolve the hosted style through `getVectorMapConfig()` and `buildMapLibreStyle()`. The default is OpenFreeMap Liberty; an offline state produces the intentional pins-only style rather than promising an offline basemap.
- Build separate point and cluster GeoJSON collections outside the primitive. The world map fetches 25%-padded bounds after a debounced `moveend`; React Query retains the previous viewport while the next request is in flight.
- The world endpoint returns globally anchored server clusters through zoom 11 and individual places above that threshold. `LightweightCragMap` retains its local radius-72 Supercluster index for bounded crag-image datasets.
- Preserve antimeridian handling in padded request bounds and database filtering. Cluster clicks advance the server query zoom; pin clicks use the transparent hit-target layers and `selectId`, while visible circles and labels remain presentation layers.

### Key Files
- `components/map/MapLibreVectorMap.tsx` — shared MapLibre source, layer, controls, and event lifecycle
- `components/InteractiveClimbingMap.tsx` — debounced viewport queries and world place/cluster rendering
- `lib/map/map-bounds.ts` and `lib/map/map-pins-query.ts` — padded query bounds and React Query configuration
- `components/LightweightCragMap.tsx` — crag image pins, coordinate grouping, and Supercluster index
- `components/map/MapLibreLocationPicker.tsx` — click/drag location selection
- `components/map/MapLibreStaticLocationMap.tsx` — non-interactive location preview
- `lib/map/vector-map-config.ts` and `lib/map/maplibre-style.ts` — hosted/pins-only style resolution

### Known Edge Cases
- **Lifecycle:** Construct and remove the MapLibre instance in an effect; update sources and interactions in later effects instead of recreating the map.
- **Viewport churn:** Listen to `moveend`, not both `moveend` and `zoomend`; abort superseded requests and retain padded prior data to avoid marker flicker.
- **Geolocation:** Request browser location only after user intent, handle denial/unsupported states, and leave map exploration available.
- **Network loss:** A pins-only render and connection notice are degradation states, not an offline product guarantee.
- **Static previews:** Disable interaction and clustering where the wrapper requests a static preview.

---

## 3. GPS Extraction

### Pattern
- Extract from the original `File` before upload preprocessing. `extractGpsFromFile()` first asks exifr to parse the Blob, then retries from an `ArrayBuffer`.
- Buffer extraction tries, in order: `exifr.gps`, explicit GPS/XMP tags, structured TIFF/EXIF/GPS/XMP parsing, a full exifr parse, then JPEG-only piexif and manual APP1/TIFF parsers.
- Normalize decimal, DMS, rational, hemisphere, and common latitude/longitude key variants through `image-gps-coordinate-parser.ts`. Reject non-finite, out-of-range, and `(0, 0)` coordinates.
- HEIC/HEIF first uses metadata from the original. If absent, convert a preview and best-effort parse that JPEG buffer; conversion failure is surfaced as an image-processing failure.
- On confirmation, retry original-file extraction once if no GPS was retained. If all extraction fails, continue with `null` and require the user to choose/search for a location.

### Location Precedence
- The selected/manual draft location in `submission_drafts.metadata.submission.location` is the canonical publish location when valid.
- If it is missing, publication falls back to the first draft image with valid coordinates and repairs the draft metadata before publishing.
- Images in `custom` mode must have their own valid coordinates. Images in `shared` mode inherit the effective draft location; shared image rows store null coordinates rather than duplicating the shared point.
- Publishing fails when no effective location exists or when a custom image lacks its own location.

### Known Edge Cases
- **EXIF ordering:** GPS extraction reads the selected original while preprocessing creates the stripped upload, so GPS can be persisted separately even though the durable/uploaded JPEG uses `preserveExif: false`.
- **Prepared bytes:** HEIC is converted first, then every supported input is prepared as JPEG with maximum width or height 3200 px, maximum size 3 MiB, and initial quality 0.88. Persist and upload the same prepared bytes; do not reprocess an IndexedDB-restored queue item.
- **Policy:** See [Media Pipeline](media-pipeline.md) for private sources, canonical processing, publication, and delivery policy.

---

## 4. HEIC Conversion

### Pattern
- `convertHeicToJpegBlob()` uses `workers/heic.worker.ts` when Worker support exists.
- If workers are unavailable, or the worker itself errors, it dynamically imports `heic2any` on the main thread as a compatibility fallback.
- The result may be one Blob or an array; the converter selects the first Blob and uses JPEG quality 0.9.

### Known Edge Cases
- **Resource-intensive:** Prefer the worker path. The main-thread fallback exists for compatibility and can block on large files.
- **Limits:** `ImagePicker` accepts at most 20 files per selection. The active shared queue uses the 3200 px / 3 MiB / quality 0.88 preparation contract, not the legacy uploader's 20 MB, 1200 px, or 307 KB limits.
- **Failure:** There is no server-side HEIC conversion fallback; ask the user to provide JPEG when client conversion fails.

---

## 5. Grade Conversion

### Pattern
```typescript
import { isValidGrade } from '@/lib/grade-constants'
import { formatGradeForDisplay } from '@/lib/grade-display'

const grade = '6C'
if (isValidGrade(grade)) {
  const vScale = formatGradeForDisplay(grade, 'v_scale') // 'V5'
  const french = formatGradeForDisplay(grade, 'french_equivalent') // '7a'
}
```

### Known Edge Cases
- **Range grades:** Use `gradeMappings` from `@/lib/grades` as single source of truth for V-Scale <-> Font <-> YDS <-> French <-> British
- **Canonical storage:** Store and validate Font grades from `3A` through `9C+`; do not persist display-system strings such as `V5`.
- **Public boundaries:** Use `@/lib/grade-constants` for validation/order and `@/lib/grade-display` for presentation. `@/lib/grades` owns mappings and score calculations.

---

## 6. Media Ingest Pipeline

See [media-pipeline.md](media-pipeline.md) for the full end-to-end flow.

### Pattern
```typescript
import { createPrivateUploadUrl } from '@/lib/media/r2'

// Generate presigned upload URL
const { uploadUrl, objectKey } = await createPrivateUploadUrl(
  `uploads/${userId}/${imageId}.jpg`,
  'image/jpeg'
)
```

### Key Files
- `lib/media/r2.ts` — R2 S3 client (presigned URLs, object operations)
- `lib/media/config.ts` — storage configuration
- `lib/media/cloudflare-loader.ts` — Next.js custom image loader for CDN
- `lib/media/client-upload.ts` — client-side upload orchestration
- `lib/media/draft-storage.ts` — draft image storage
- `apps/media-worker/` — Cloudflare Worker for processing

### Known Edge Cases
- **Metadata:** Extract location from the selected original before EXIF stripping. The active queue durably stores and uploads the exact prepared JPEG while storing GPS separately in the database.
- **Public delivery:** Serve ready immutable variants from the CDN hostname, not app-route proxies.
- **Canonical source:** Worker ingest persists a private, content-addressed WebP at maximum width 2560 px and quality 82. Ready virtual variants derive from this canonical object, not the prepared source.
- **Provenance:** `original_bucket` and `original_key` remain the source record after canonical commit. The object becomes deletion-eligible only after public delivery is verified and the durable source-replacement job is armed.
- **Offline packs:** Include only complete canonical optimized WebP tuples and download immutable versioned CDN variants. Never use original locators to determine offline eligibility.
- **Failure ordering:** Verify the canonical object before atomically switching delivery and queueing `source_replaced`, then verify anonymous public delivery before allowing the deletion worker to claim the source. A failed commit can leave an unreferenced canonical object at its deterministic key for retry.
- **Cache busting:** Use immutable canonical keys and versioned virtual paths like `v{asset_version}` instead of mutable objects.
- **Worker safety:** Async ingest and deletion jobs must be idempotent. Immediate source deletion is only an accelerator; durable outbox retries are authoritative.

---

## 7. Offline Crag Packs / Vector Maps

### Pattern
- Keep navigation online-first and rely on normal browser/CDN HTTP caching.
- Use MapLibre + OpenFreeMap as the foundation for all live maps, picker maps, and static location snippets.
- Load the hosted OpenFreeMap style via `NEXT_PUBLIC_MAP_STYLE_URL`, defaulting to `https://tiles.openfreemap.org/styles/liberty`.
- Do not add live third-party raster basemaps, satellite toggles, or separate raster label layers by default.
- Use clear connection states when live map data cannot load. Pins-only rendering is a visual degradation, not an offline-availability promise.
- User-selected crag packs are the only standalone offline product. Store their versioned public metadata in the dedicated `letsboulder-offline-packs` IndexedDB database and immutable fixed-format media in the shared `letsboulder-offline-immutable-v1` Cache API cache. Child climb manifests may be fetched only as internal crag-pack dependencies; standalone climb packs and route viewers are unsupported.
- Use Pack v2 as documented in `docs/offline-pack-v2.md`: stage, validate exact bytes and SHA-256, verify relationships/reader compatibility, atomically activate, retain the predecessor through first successful open, then garbage-collect only unowned assets.
- Keep downloads foreground-resumable instead of assuming a service worker will remain alive. The worker serves shells and cached responses; IndexedDB download jobs own recovery.

### Key Files
- `components/ServiceWorkerRegistration.tsx` — root-mounted registration and safe update prompt for `/sw.js`
- `public/sw.js` — cache-first saved-guide shells, network-first online navigation fallback, and immutable build/pack media caching
- `features/offline/components/OfflineLibraryView.tsx` — installed pack library backed by the offline pack store
- `features/offline/components/OfflineCragViewer.tsx` — standalone IndexedDB-backed crag metadata, topo, route-line, and pins-only viewer
- `components/map/MapLibreVectorMap.tsx` — shared MapLibre primitive for live vector maps
- `components/map/MapLibreLocationPicker.tsx` — shared click/drag location picker map
- `components/map/MapLibreStaticLocationMap.tsx` — shared non-interactive location snippet map
- `lib/map/vector-map-config.ts` — shared resolver for hosted style vs pins-only fallback
- `lib/map/maplibre-style.ts` — MapLibre style resolver
- `features/offline/lib/offline-pack-database.ts` — versioned offline pack metadata and ownership records in IndexedDB
- `lib/offline/service-worker-client.ts` — browser capability checks and shared registration/chunk-recovery constants
- `lib/offline/tiles.ts` and `/api/offline-tiles/**` — legacy raster compatibility artifacts retained during retirement
- `features/offline/lib/offline-pack-*.ts` — validated manifests, resumable versioned downloads, immutable media ownership, and external-store state
- `lib/query-persistence.ts` — React Query IndexedDB persistence (12h max age)
- `features/media-upload/lib/durable-upload-store.ts` — auth-scoped contribution Blob and queue checkpoints retained until server attachment is confirmed
- `features/draft-editor/lib/draft-editor-checkpoint.ts` — auth-scoped unsaved route geometry and sector checkpoints

### Known Edge Cases
- **Cache retirement:** Activation deletes only the explicit retired cache names in `/sw.js`; never delete unrelated Cache Storage entries or the active immutable pack cache.
- **Shell releases:** Bump the shell/static cache suffix when changing the worker or offline shell contract. Installation must fully cache required shells and discovered Next assets before activation removes the preceding owned release cache.
- **Offline navigation:** `/offline`, `/offline/library`, and `/offline/crag` must resolve from the shell cache before any network request. `/offline` renders the library directly; connectivity verification is informational and must never gate saved content. The worker stores its build-cache manifest in the shell cache so cached application chunks remain readable after the worker is suspended and restarted offline.
- **Stored data:** Pack versions activate only after every required immutable asset has an exact-byte and SHA-256 checkpoint. Active and retained ownership protects shared assets.
- **Quota:** Compare browser storage estimates against uncached incremental bytes with safety headroom. Browser persistence requests remain best-effort and the UI must surface failures.
- **Updates:** Opening a downloaded crag checks its deterministic manifest version while online. Changed packs require user confirmation; a failed update leaves the active version intact.
- **Compatibility:** Pack v1 stores are read-only migration inputs. Readers keep legacy public guides usable, but only independently downloaded and verified Pack v2 bytes can become Verified.
- **Connectivity:** Offline screens verify same-origin reachability through `/api/connectivity`; browser online/offline events are hints, not the sole source of truth. Reconnection exposes an explicit return to the online app.
- **Recovery:** Startup, reconnect, and foreground return resume queued, downloading, and resumable failed jobs only. Permanent validation failures require explicit retry or discard. A failed update keeps the previous active version readable; repair rehashes all required bytes.
- **Eviction:** Active required assets are read and rehashed before readiness is trusted. Missing or corrupt media marks the guide Needs repair without hiding intact metadata or pins.
- **Auth:** Crag packs contain public content only and are device-local, so auth changes do not remove them. Never mix personal logs, private media, signed URLs, or collaboration data into a public pack.
- **Network routes:** Preserve the current screen when a refetch fails and provide retry controls for failed initial loads.
- **Hosted basemap CSP:** `tiles.openfreemap.org` must remain allowed in `connect-src`, `img-src`, and `font-src`.
- **Legacy maps:** `/api/offline-tiles` is retirement-only infrastructure and must not be presented as available offline.

---

## 8. Community Posts

### Pattern
- Use Server Actions in `features/community/actions.ts` for app-owned writes. `createCommunityPostAction()` validates a typed object, resolves auth with `getActionAuth()`, verifies the place, and returns `ActionResult` data rather than throwing for expected failures.
- Community posts use database fields `author_id`, `place_id`, `type`, `title`, and `body`; do not use the obsolete `user_id`, `post_type`, or `content` interface.
- Session posts additionally support discipline, grade range, start/end times, RSVP state, and comments. Comments are intentionally limited to session posts.
- Read surfaces under `/api/community/places/[slug]/**` are public query endpoints. Mutations remain Server Actions, so they do not use `csrfFetch()`.
- RSVP identities are private. Public totals come from `community_post_rsvp_counts`; query `community_post_rsvps` only for the authenticated viewer's own status or mutation.

### Key Files
- `features/community/actions.ts` — authenticated post, RSVP, and comment mutations
- `features/community/server/load-place-community-data.ts` — initial community data
- `features/community/components/SessionComposer.tsx` and `UpdateComposer.tsx` — current composer contracts
- `features/community/components/UpcomingFeed.tsx` and `UpdatesFeed.tsx` — feed rendering and client mutations

### Known Edge Cases
- **Validation:** Session posts require a valid start time; end time cannot precede it, and discipline must be allowlisted.
- **Authorization:** Resolve the author server-side and rely on RLS as an additional boundary; never accept an author ID from the client.
- **RSVP counts:** Do not calculate totals by selecting all RSVP rows. Direct reads return only the caller's row, so totals must use the sanitized aggregate view.
- **Persistence:** Community queries are deliberately excluded from the persisted React Query cache.

---

<next_steps>
  - Add new patterns as climbing features evolve
  - Document edge cases when bugs are discovered in production
</next_steps>
