# Offline / PWA Architecture

## Service Worker — `public/sw.js`

### Cache Layers

| Cache Name | Contents |
|---|---|
| `offline-shell-v3` | Shell pages (/, /offline, /offline/library, manifest.json, logos) + Next.js static assets |
| `offline-climb-packs-v3` | Saved crag/climb page documents |
| `offline-media-v2` | Cached media (images) from saved packs |
| `offline-tiles-v2` | Cached map tiles from saved packs |
| `offline-route-assets-v2` | Next.js build assets (JS, CSS) |
| `runtime-transient-v2` | Transient runtime cache |

### SW Messages

| Message | Action |
|---|---|
| `SAVE_CLIMB_PACK` | Caches climb page, media, and tiles |
| `REMOVE_CLIMB_PACK` | Removes climb from caches |
| `SAVE_CRAG_PACK` | Caches crag + all child climb pages, media, and tiles (with progress broadcast) |
| `REMOVE_CRAG_PACK` | Removes crag + orphaned climbs from caches |
| `SKIP_WAITING` | Activates new SW immediately |

### Fetch Strategies

| Resource | Strategy |
|---|---|
| Shell routes | Network-first, shell cache fallback |
| Media | Cache-first, network fallback (504 if offline and uncached) |
| Tiles | Cache-first, network fallback (504 if offline and uncached) |
| Climb/crag pages | Network-first, pack cache fallback |
| Route assets | Cache-first, network fallback |

## Pack System — `lib/offline/packs.ts`

- `saveClimbOfflinePack(climbId)` — save a single climb for offline
- `deleteClimbOfflinePack(climbId)` — remove a single climb
- `saveCragOffline(cragId, onProgress?)` — save entire crag with all climbs
- `removeCragOffline(cragId)` — remove crag, handle orphaned climbs
- `getCragOfflinePreview(cragId)` — preview bytes, changed climbs, up-to-date status
- `OFFLINE_PACK_BUDGET_BYTES = 250 * 1024 * 1024` — 250 MB budget

## Storage — `lib/offline/storage.ts`

IndexedDB stores pack records, climb manifests, and crag manifests.

Tracked fields: `packId`, `type`, `entityId`, `versionHash`, `estimatedBytes`, `mediaCount`, `tileCount`.

## SW Messages Client — `lib/offline/sw-messages.ts`

- `sendServiceWorkerMessage(msg)` — post message to SW with MessageChannel response
- `subscribeToOfflineJobProgress(jobId, callback)` — BroadcastChannel listener for progress events

## Query Persistence — `lib/query-persistence.ts`

TanStack React Query persisted to IndexedDB via `@tanstack/react-query-persist-client`. Max age 12 hours. Keeps cached data available offline.

## Offline Pages

| Route | Purpose |
|---|---|
| `/offline` | Launcher page, shows saved packs |
| `/offline/library` | Detailed pack management |

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `public/sw.js` | 538 | Service worker |
| `lib/offline/packs.ts` | 495 | Pack management |
| `lib/offline/storage.ts` | — | IndexedDB storage |
| `lib/offline/tiles.ts` | — | Tile URL building |
| `lib/offline/sw-messages.ts` | — | SW communication |
| `lib/query-persistence.ts` | — | React Query persistence |
| `app/offline/page.tsx` | — | Offline launcher |
| `app/offline/library/page.tsx` | — | Offline library |
