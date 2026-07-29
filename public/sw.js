const SHELL_CACHE = 'letsboulder-offline-shell-v2'
const STATIC_CACHE = 'letsboulder-next-static-v2'
const PACKED_MEDIA_CACHE = 'letsboulder-offline-immutable-v1'
const SHELL_PATHS = ['/offline', '/offline/library', '/offline/crag']
const RETIRED_CACHE_NAMES = new Set([
  'offline-shell-v4',
  'offline-climb-packs-v3',
  'offline-media-v2',
  'offline-tiles-v2',
  'offline-route-assets-v2',
  'runtime-transient-v2',
  'letsboulder-offline-shell-v1',
  'letsboulder-next-static-v1',
])

async function cacheShell() {
  const shellCache = await caches.open(SHELL_CACHE)
  const staticCache = await caches.open(STATIC_CACHE)

  await Promise.all(SHELL_PATHS.map(async (path) => {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Unable to cache offline shell: ${path}`)

    await shellCache.put(path, response.clone())
    const html = await response.text()
    const assetPaths = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^" ]*)?)"/g)]
      .map((match) => match[1])
      .filter(Boolean)

    await Promise.all(assetPaths.map(async (assetPath) => {
      const assetResponse = await fetch(assetPath)
      if (!assetResponse.ok) throw new Error(`Unable to cache offline asset: ${assetPath}`)
      await staticCache.put(assetPath, assetResponse)
    }))
  }))
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function cacheFirstPackedMedia(request) {
  const cache = await caches.open(PACKED_MEDIA_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    return await fetch(request)
  } catch {
    return new Response('', { status: 504, statusText: 'Offline media unavailable' })
  }
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request)
    const pathname = new URL(request.url).pathname
    if (response.ok && SHELL_PATHS.includes(pathname)) {
      const shellCache = await caches.open(SHELL_CACHE)
      await shellCache.put(pathname, response.clone())
    }
    return response
  } catch {
    const exact = await caches.match(request)
    if (exact) return exact

    const pathname = new URL(request.url).pathname
    const shellPath = SHELL_PATHS.includes(pathname) ? pathname : '/offline'
    const shellCache = await caches.open(SHELL_CACHE)
    return (await shellCache.match(shellPath))
      || (await shellCache.match('/offline'))
      || new Response('<!doctype html><title>Offline</title><h1>You are offline</h1>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.filter((name) => RETIRED_CACHE_NAMES.has(name)).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request))
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstStatic(request))
  } else if (request.destination === 'image') {
    event.respondWith(cacheFirstPackedMedia(request))
  }
})
