const SHELL_CACHE = 'offline-shell-v3'
self.__WB_DISABLE_DEV_LOGS = true

const PACK_CACHE = 'offline-climb-packs-v3'
const MEDIA_CACHE = 'offline-media-v2'
const TILE_CACHE = 'offline-tiles-v2'
const ROUTE_ASSET_CACHE = 'offline-route-assets-v2'
const TRANSIENT_CACHE = 'runtime-transient-v2'
const OFFLINE_LAUNCH_URL = '/offline'
const OFFLINE_LIBRARY_URL = '/offline/library'
const HOME_URL = '/'
const MANIFEST_URL = '/manifest.json'
const LOGO_URL = '/logo.png'
const LOGO_LIGHT_URL = '/logo-light.png'
const LOGO_DARK_URL = '/logo-dark.png'
const OFFLINE_JOB_CHANNEL = 'offline-pack-jobs'
const ACTIVE_CACHES = [SHELL_CACHE, PACK_CACHE, MEDIA_CACHE, TILE_CACHE, ROUTE_ASSET_CACHE, TRANSIENT_CACHE]
const SHELL_ROUTES = [HOME_URL, OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, MANIFEST_URL, LOGO_URL, LOGO_LIGHT_URL, LOGO_DARK_URL]

function toSameOriginRequest(url) {
  return new Request(url, { credentials: 'same-origin' })
}

async function cacheRequests(cacheName, requests) {
  const cache = await caches.open(cacheName)
  await Promise.all(requests.map(async (request) => {
    try {
      const response = await fetch(request)
      if (response.ok) {
        await cache.put(request, response.clone())
      }
    } catch {
      // Ignore install-time shell misses and keep the worker alive.
    }
  }))
}

async function collectShellAssetRequests() {
  const requests = new Map()
  const shellPages = [HOME_URL, OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL]

  for (const pageUrl of shellPages) {
    try {
      const response = await fetch(toSameOriginRequest(pageUrl))
      if (!response.ok) continue

      const html = await response.text()
      const assetMatches = html.matchAll(/(?:href|src)="(\/_next\/static\/[^\"]+\.(?:css|js))"/g)

      for (const match of assetMatches) {
        const assetUrl = match[1]
        if (!assetUrl) continue
        requests.set(assetUrl, toSameOriginRequest(assetUrl))
      }
    } catch {
      // Ignore transient HTML fetch failures during install.
    }
  }

  return Array.from(requests.values())
}

async function collectPageAssetRequests(pageUrls) {
  const requests = new Map()

  for (const pageUrl of pageUrls) {
    if (!pageUrl || pageUrl.startsWith('/api/')) continue

    try {
      const response = await fetch(toSameOriginRequest(pageUrl))
      if (!response.ok) continue

      const html = await response.text()
      const assetMatches = html.matchAll(/(?:href|src)="(\/_next\/(?:static\/[^"]+\.(?:css|js)|image\?[^\"]+))"/g)

      for (const match of assetMatches) {
        const assetUrl = match[1]
        if (!assetUrl) continue
        requests.set(assetUrl, toSameOriginRequest(assetUrl))
      }
    } catch {
      // Ignore transient page asset discovery failures.
    }
  }

  return Array.from(requests.values())
}

async function installShell() {
  const shellRequests = SHELL_ROUTES.map((url) => toSameOriginRequest(url))
  const shellAssetRequests = await collectShellAssetRequests()
  await cacheRequests(SHELL_CACHE, [...shellRequests, ...shellAssetRequests])
}

async function cachePageAssets(pageUrls) {
  const assetRequests = await collectPageAssetRequests(pageUrls)
  if (assetRequests.length === 0) return
  await cacheRequests(ROUTE_ASSET_CACHE, assetRequests)
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await installShell()
    const cache = await caches.open(PACK_CACHE)
    await cache.add(toSameOriginRequest(OFFLINE_LAUNCH_URL))
    await cache.add(toSameOriginRequest(OFFLINE_LIBRARY_URL))
    await cache.add(toSameOriginRequest(HOME_URL))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.filter((cacheName) => !ACTIVE_CACHES.includes(cacheName)).map((cacheName) => caches.delete(cacheName)))

    const shellCache = await caches.open(SHELL_CACHE)
    const shellKeys = await shellCache.keys()
    await Promise.all(shellKeys.filter((key) => key.url.includes('/_next/static/')).map((key) => shellCache.delete(key)))

    const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
    const routeAssetKeys = await routeAssetCache.keys()
    await Promise.all(routeAssetKeys.map((key) => routeAssetCache.delete(key)))

    await self.clients.claim()
  })())
})

function broadcastProgress(payload) {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(OFFLINE_JOB_CHANNEL)
  channel.postMessage(payload)
  channel.close()
}

async function cacheUrls(cacheName, urls, options = {}) {
  const cache = await caches.open(cacheName)
  const {
    concurrency = 3,
    onProgress,
    strict = true,
  } = options
  const failures = []

  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(urls.length, 1)) }, async () => {
    while (index < urls.length) {
      const currentIndex = index++
      const url = urls[currentIndex]
      if (!url) continue

      const request = new Request(url, { credentials: 'same-origin' })
      const cached = await cache.match(request)
      if (cached) {
        if (onProgress) onProgress(url, true)
        continue
      }

      try {
        const response = await fetch(request)
        if (!response.ok) {
          throw new Error(`Failed to cache ${url}`)
        }

        await cache.put(request, response.clone())
        if (onProgress) onProgress(url, false)
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to cache ${url}`
        failures.push({ url, error: message })
        if (strict) {
          throw new Error(message)
        }
      }
    }
  })

  await Promise.all(workers)
  return failures
}

async function removeUrls(cacheName, urls) {
  const cache = await caches.open(cacheName)
  await Promise.all(urls.map((url) => cache.delete(toSameOriginRequest(url))))
}

async function matchCachedRequest(cache, request) {
  const directMatch = await cache.match(request)
  if (directMatch) return directMatch

  if (request.mode === 'navigate') {
    const url = new URL(request.url)
    const normalized = toSameOriginRequest(`${url.origin}${url.pathname}`)
    return cache.match(normalized)
  }

  return undefined
}

async function matchShellRequest(request) {
  const shellCache = await caches.open(SHELL_CACHE)
  const directMatch = await shellCache.match(request, { ignoreSearch: true })
  if (directMatch) return directMatch

  if (request.mode === 'navigate') {
    const url = new URL(request.url)
    const normalized = await shellCache.match(toSameOriginRequest(`${url.origin}${url.pathname}`), { ignoreSearch: true })
    if (normalized) return normalized
  }

  return undefined
}

async function matchRouteAssetRequest(request) {
  const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
  const directMatch = await routeAssetCache.match(request)
  if (directMatch) return directMatch

  const shellCache = await caches.open(SHELL_CACHE)
  return shellCache.match(request)
}

async function handleShellFetch(request) {
  const url = new URL(request.url)

  try {
    const response = await fetch(request)
    if (response.ok) {
      const shellCache = await caches.open(SHELL_CACHE)
      await shellCache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await matchShellRequest(request)
    if (cached) return cached
    if (request.mode === 'navigate' && url.pathname === OFFLINE_LAUNCH_URL) {
      const fallback = await matchShellRequest(toSameOriginRequest(OFFLINE_LAUNCH_URL))
      if (fallback) return fallback
    }

    if (request.mode === 'navigate') {
      const offlineLibraryFallback = await matchShellRequest(toSameOriginRequest(OFFLINE_LIBRARY_URL))
      if (offlineLibraryFallback) return offlineLibraryFallback

      const homeFallback = await matchShellRequest(toSameOriginRequest(HOME_URL))
      if (homeFallback) return homeFallback
    }

    return Response.error()
  }
}

async function handleRouteAssetFetch(request) {
  const cached = await matchRouteAssetRequest(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
      await routeAssetCache.put(request, response.clone())
    }
    return response
  } catch {
    const fallback = await matchRouteAssetRequest(request)
    if (fallback) return fallback
    return Response.error()
  }
}

self.addEventListener('message', (event) => {
  const reply = event.ports && event.ports[0]
  const message = event.data || {}

  const respond = (payload) => {
    if (reply) reply.postMessage(payload)
  }

  event.waitUntil((async () => {
    try {
      if (message.type === 'SKIP_WAITING') {
        await self.skipWaiting()
        respond({ ok: true })
        return
      }

      if (message.type === 'SAVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const tileUrls = Array.isArray(pack.tileUrls) ? pack.tileUrls : []
        const packUrls = [OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, HOME_URL, `/climb/${pack.climbId}`, pack.pageUrl, pack.manifestUrl].filter(Boolean)
        await cacheUrls(PACK_CACHE, packUrls)
        await cachePageAssets(packUrls)
        await cacheUrls(MEDIA_CACHE, mediaUrls)
        const tileFailures = await cacheUrls(TILE_CACHE, tileUrls, { strict: false })
        respond({
          ok: true,
          warning: tileFailures.length > 0 ? 'Saved core offline content, but some map tiles could not be cached.' : undefined,
          failedTileUrls: tileFailures.map((failure) => failure.url),
        })
        return
      }

      if (message.type === 'REMOVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const tileUrls = Array.isArray(pack.tileUrls) ? pack.tileUrls : []
        const packUrls = [`/climb/${pack.climbId}`, pack.pageUrl, pack.manifestUrl].filter(Boolean)
        await removeUrls(PACK_CACHE, packUrls)
        await removeUrls(MEDIA_CACHE, mediaUrls)
        await removeUrls(TILE_CACHE, tileUrls)
        respond({ ok: true })
        return
      }

      if (message.type === 'SAVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        const tileUrls = Array.isArray(payload.tileUrls) ? payload.tileUrls : []
        const cragEntryUrls = [payload.canonicalPath, payload.fallbackPath, payload.manifestUrl].filter(Boolean)
        const totalClimbs = climbs.length
        const totalBytes = Number(payload.totalBytes || 0)
        let completedClimbs = 0
        let completedBytes = 0
        const failedTileUrls = []

        broadcastProgress({
          type: 'OFFLINE_JOB_PROGRESS',
          jobId: payload.jobId,
          phase: 'cache-pages',
          completedClimbs,
          totalClimbs,
          completedBytes,
          totalBytes,
        })

        await cacheUrls(PACK_CACHE, [OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, HOME_URL, ...cragEntryUrls])
        await cachePageAssets([OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, HOME_URL, ...cragEntryUrls])
        const rootTileFailures = await cacheUrls(TILE_CACHE, tileUrls, { concurrency: 4, strict: false })
        failedTileUrls.push(...rootTileFailures.map((failure) => failure.url))

        for (const climb of climbs) {
          await cacheUrls(PACK_CACHE, [`/climb/${climb.climbId}`, climb.pageUrl, climb.manifestUrl].filter(Boolean))
          await cachePageAssets([`/climb/${climb.climbId}`, climb.pageUrl])
          const climbTileFailures = await cacheUrls(TILE_CACHE, Array.isArray(climb.tileUrls) ? climb.tileUrls : [], {
            concurrency: 4,
            strict: false,
          })
          failedTileUrls.push(...climbTileFailures.map((failure) => failure.url))

          broadcastProgress({
            type: 'OFFLINE_JOB_PROGRESS',
            jobId: payload.jobId,
            phase: 'cache-media',
            completedClimbs,
            totalClimbs,
            completedBytes,
            totalBytes,
            currentClimbId: climb.climbId,
            currentClimbName: climb.climbName,
          })

          await cacheUrls(MEDIA_CACHE, Array.isArray(climb.mediaUrls) ? climb.mediaUrls : [], {
            concurrency: 3,
          })

          completedClimbs += 1
          completedBytes += Number(climb.estimatedBytes || 0)
          broadcastProgress({
            type: 'OFFLINE_JOB_PROGRESS',
            jobId: payload.jobId,
            phase: 'cache-media',
            completedClimbs,
            totalClimbs,
            completedBytes,
            totalBytes,
            currentClimbId: climb.climbId,
            currentClimbName: climb.climbName,
          })
        }

        broadcastProgress({
          type: 'OFFLINE_JOB_PROGRESS',
          jobId: payload.jobId,
          phase: 'done',
          completedClimbs,
          totalClimbs,
          completedBytes,
          totalBytes,
        })

        respond({
          ok: true,
          warning: failedTileUrls.length > 0 ? 'Saved core offline content, but some map tiles could not be cached.' : undefined,
          failedTileUrls,
        })
        return
      }

      if (message.type === 'REMOVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        const tileUrls = Array.isArray(payload.tileUrls) ? payload.tileUrls : []
        await removeUrls(PACK_CACHE, [payload.canonicalPath, payload.fallbackPath, payload.manifestUrl].filter(Boolean))
        await removeUrls(TILE_CACHE, tileUrls)
        for (const climb of climbs) {
          await removeUrls(PACK_CACHE, [`/climb/${climb.climbId}`, climb.pageUrl, climb.manifestUrl].filter(Boolean))
          await removeUrls(MEDIA_CACHE, Array.isArray(climb.mediaUrls) ? climb.mediaUrls : [])
          await removeUrls(TILE_CACHE, Array.isArray(climb.tileUrls) ? climb.tileUrls : [])
        }
        respond({ ok: true })
        return
      }

      respond({ ok: false, error: 'Unsupported service worker action' })
    } catch (error) {
      const payload = {
        type: 'OFFLINE_JOB_PROGRESS',
        jobId: message.payload?.jobId,
        phase: 'error',
        completedClimbs: 0,
        totalClimbs: Array.isArray(message.payload?.climbs) ? message.payload.climbs.length : 0,
        completedBytes: 0,
        totalBytes: Number(message.payload?.totalBytes || 0),
        error: error instanceof Error ? error.message : 'Service worker action failed',
      }
      broadcastProgress(payload)
      respond({ ok: false, error: payload.error })
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isMediaRequest = url.pathname.startsWith('/api/media/')
  const isOfflineTileRequest = url.pathname.startsWith('/api/offline-tiles/')
  const isPackRequest = url.pathname.startsWith('/api/offline-packs/climbs/') || url.pathname.startsWith('/api/offline-packs/crags/')
  const isOfflineLaunch = request.mode === 'navigate' && url.pathname === OFFLINE_LAUNCH_URL
  const isOfflineLibrary = request.mode === 'navigate' && url.pathname === OFFLINE_LIBRARY_URL
  const isClimbPage = request.mode === 'navigate' && url.pathname.startsWith('/climb/')
  const isCragPage = request.mode === 'navigate' && (url.pathname.startsWith('/crag/') || /^\/[a-z]{2}\//.test(url.pathname))
  const isManifestRequest = url.pathname === MANIFEST_URL
  const isStaticBuildAsset = url.pathname.startsWith('/_next/static/')
  const isShellAsset = url.pathname === LOGO_URL
  const isRouteAsset = isStaticBuildAsset || url.pathname === LOGO_LIGHT_URL || url.pathname === LOGO_DARK_URL || url.pathname === LOGO_URL

  if (isMediaRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return new Response('', { status: 504, statusText: 'Offline media unavailable' })
      }
    })())
    return
  }

  if (isOfflineTileRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return new Response('', { status: 504, statusText: 'Offline tile unavailable' })
      }
    })())
    return
  }

  if (isRouteAsset) {
    event.respondWith(handleRouteAssetFetch(request))
    return
  }

  if (isOfflineLaunch || isOfflineLibrary || isPackRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(PACK_CACHE)
      const cached = await matchCachedRequest(cache, request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        const fallbackCached = await matchCachedRequest(cache, request)
        if (fallbackCached) return fallbackCached

        throw error
      }
    })())
    return
  }

  if (isClimbPage || isCragPage) {
    event.respondWith((async () => {
      const cache = await caches.open(PACK_CACHE)

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        const fallbackCached = await matchCachedRequest(cache, request)
        if (fallbackCached) return fallbackCached

        throw error
      }
    })())
    return
  }

  if (request.mode === 'navigate' || isManifestRequest || isShellAsset) {
    event.respondWith(handleShellFetch(request))
  }
})
