importScripts('/sw-constants.js')
importScripts('/sw-cache-utils.js')
importScripts('/sw-matchers.js')
importScripts('/sw-fetch-handlers.js')
importScripts('/sw-message-handlers.js')

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await installShell()
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.filter((cacheName) => !ACTIVE_CACHES.includes(cacheName) && !cacheName.startsWith(`${BUILD_ASSET_CACHE_PREFIX}-`)).map((cacheName) => caches.delete(cacheName)))
    await purgeStaleBuildAssetCaches()

    await self.clients.claim()
  })())
})

self.addEventListener('message', handleMessageEvent)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_AUTH_CACHES') {
    event.waitUntil((async () => {
      await caches.delete(MEDIA_CACHE)
      await caches.open(MEDIA_CACHE)
    })())
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isMediaRequest = url.pathname.startsWith('/api/media/')
  const isOfflineTileRequest = url.pathname.startsWith('/api/offline-tiles/')
  const isManifestRequest = url.pathname === MANIFEST_URL
  const isStaticBuildAsset = url.pathname.startsWith('/_next/static/')
  const isShellAsset = url.pathname === LOGO_URL || url.pathname === LOGO_LIGHT_URL || url.pathname === LOGO_DARK_URL || url.pathname === THEME_INIT_URL
  const isRouteAsset = isShellAsset

  if (isMediaRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          const cacheControl = response.headers.get('Cache-Control') || ''
          const isPublic = cacheControl.includes('public') && !cacheControl.includes('no-store')
          if (isPublic) {
            await cache.put(request, response.clone())
          }
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

  if (isStaticBuildAsset) return

  if (request.mode === 'navigate' || isManifestRequest || isShellAsset) {
    event.respondWith(handleShellFetch(request))
  }
})
