# Offline / PWA Architecture

## Current Contract

- Offline uses the same canonical app routes where possible.
- Saved packs now prefer deterministic launch URLs via manifest fields such as `offlineLaunchUrl` and `imageFirstUrl`.
- Saved climbs prefer image-first topo routes.
- Saved crags prefer a saved child climb topo/image route when available, otherwise the canonical crag page.
- `/offline` is now a dispatcher route. It redirects to `/` when online and `/offline/library?reason=offline` when offline.
- Uncached offline navigations now recover to `/offline/library?reason=offline-miss&from=<requested-path>` instead of failing hard.
- The map stack may still support a degraded offline basemap path, but crag downloads no longer include map tiles.

## Service Worker — `public/sw.js`

### Cache Layers

| Cache Name | Contents |
|---|---|
| `offline-shell-v3` | Shell pages (/, /offline, /offline/library, manifest.json, logos) + Next.js static assets |
| `offline-climb-packs-v3` | Saved crag/climb page documents |
| `offline-media-v2` | Cached media (images) from saved packs |
| `offline-tiles-v2` | Optional degraded basemap tiles when fetched independently |
| `offline-route-assets-v2` | Next.js build assets (JS, CSS) |
| `runtime-transient-v2` | Transient runtime cache |

### SW Messages

| Message | Action |
|---|---|
| `SAVE_CLIMB_PACK` | Caches climb page, image-first launch page, media, and tiles |
| `REMOVE_CLIMB_PACK` | Removes climb from caches |
| `SAVE_CRAG_PACK` | Caches saved crag launch page + all child climb launch pages, required route assets, and media (with progress broadcast) |
| `REMOVE_CRAG_PACK` | Removes crag + orphaned climbs from caches |
| `SKIP_WAITING` | Activates new SW immediately |

### Fetch Strategies

| Resource | Strategy |
|---|---|
| Shell routes | Network-first, shell cache fallback |
| Media | Cache-first, network fallback (504 if offline and uncached) |
| Tiles | Cache-first, offline tile cache fallback via `/api/offline-tiles/{layer}/{z}/{x}/{y}` when maps request them |
| Climb/crag pages | Network-first, pack cache fallback |
| Route assets | Cache-first, network fallback |

### Offline Navigation Recovery

- Saved canonical routes are cached explicitly during pack install.
- If a climb/crag route is requested offline and the exact document is not cached, the service worker redirects to `/offline/library?reason=offline-miss&from=<requested-path>`.
- This prevents dead-end offline navigation failures.

## Pack System — `lib/offline/packs.ts`

- `saveClimbOfflinePack(climbId)` — save a single climb for offline
- `deleteClimbOfflinePack(climbId)` — remove a single climb
- `saveCragOffline(cragId, onProgress?)` — save entire crag with all climbs
- `removeCragOffline(cragId)` — remove crag, handle orphaned climbs
- `getCragOfflinePreview(cragId)` — preview bytes, changed climbs, up-to-date status
- `OFFLINE_PACK_BUDGET_BYTES = 250 * 1024 * 1024` — 250 MB budget

### Manifest Fields Used for Launch

- `offlineLaunchUrl` — preferred saved launch URL for offline entry
- `imageFirstUrl` — explicit image-first topo route for saved climbs
- `canonicalPath` / `pageUrl` — fallback route metadata

## Storage — `lib/offline/storage.ts`

IndexedDB stores pack records, climb manifests, and crag manifests.

Tracked fields: `packId`, `type`, `entityId`, `versionHash`, `estimatedBytes`, `mediaCount`, `tileCount`.

Additional lookup helpers are now used for offline image-first rendering:

- `getStoredClimbManifest(climbId)`
- `getStoredClimbManifestByImageId(imageId)`
- `getStoredCragClimbPayloads(cragId)`

## SW Messages Client — `lib/offline/sw-messages.ts`

- `sendServiceWorkerMessage(msg)` — post message to SW with MessageChannel response
- `subscribeToOfflineJobProgress(jobId, callback)` — BroadcastChannel listener for progress events

## Query Persistence — `lib/query-persistence.ts`

TanStack React Query persisted to IndexedDB via `@tanstack/react-query-persist-client`. Max age 12 hours. Keeps cached data available offline.

## Offline Pages

| Route | Purpose |
|---|---|
| `/offline` | Online/offline dispatcher route |
| `/offline/library` | Saved pack library and offline recovery surface |

## Offline Map Basemap

- Online maps still prefer satellite imagery + boundaries/place labels.
- Offline/degraded maps now resolve to app-owned tile routes:
  - `/api/offline-tiles/imagery/{z}/{x}/{y}`
  - `/api/offline-tiles/labels/{z}/{x}/{y}`
- The current implementation is cache-backed and app-owned, but still proxy-fetches upstream tile providers on cache miss.
- These tiles are no longer part of the downloaded crag pack contract.

## Key Files

| File | Purpose |
|---|---|
| `public/sw.js` | Service worker |
| `lib/offline/packs.ts` | Pack management |
| `lib/offline/storage.ts` | IndexedDB storage |
| `lib/offline/tiles.ts` | Layered offline tile manifest building |
| `lib/map/base-layer.ts` | Shared online/offline basemap resolver |
| `lib/offline/sw-messages.ts` | SW communication |
| `lib/query-persistence.ts` | React Query persistence |
| `app/offline/page.tsx` | Offline launcher |
| `app/offline/library/page.tsx` | Offline library |
