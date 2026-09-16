// Authoritative offline worker. Cache versions: shell v4, immutable media v1,
// and static assets under letsboulder-next-static-{build-manifest.version}.
// Responsible for offline shell precaching, navigation fallback, Next static
// asset caching, immutable packed-media caching, cache retirement, and updates.
importScripts('/sw-build-version.js')
const MAPLIBRE_ASSETS = ['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs']
const SHELL_CACHE = 'letsboulder-offline-shell-v4'
const STATIC_CACHE_PREFIX = 'letsboulder-next-static-'
const PACKED_MEDIA_CACHE = 'letsboulder-offline-immutable-v1'
const BUILD_ASSET_MANIFEST_URL = '/sw-build-assets.json'
const SHELL_PATHS = ['/offline', '/offline/library', '/offline/crag']
const APPROVED_MEDIA_ORIGINS = new Set([
  self.location.origin,
  'https://static.staging.letsboulder.com',
  'https://static.letsboulder.com',
])
const PACKED_MEDIA_PATH = /^\/images\/[^/]+\/v\d+\/[^/]+\.webp$/
const RETIRED_CACHE_NAMES = new Set([
  'offline-shell-v4',
  'offline-climb-packs-v3',
  'offline-media-v2',
  'offline-tiles-v2',
  'offline-route-assets-v2',
  'runtime-transient-v2',
  'letsboulder-offline-shell-v1',
  'letsboulder-offline-shell-v2',
  'letsboulder-offline-shell-v3',
  'letsboulder-next-static-v1',
])
// The imported build version survives worker restarts and is isolated from a
// newer worker installing alongside this one. Never discover it in a shared cache.
async function getStaticCacheName() {
  const version = self.__LETSBOULDER_BUILD_VERSION
  if (typeof version !== 'string' || version.length === 0) throw new Error('Missing service worker build version')
  return `${STATIC_CACHE_PREFIX}${version}`
}

async function cacheShell() {
  const shellCache = await caches.open(SHELL_CACHE)
  const staticCache = await caches.open(await getStaticCacheName())
  const manifestResponse = await fetch(BUILD_ASSET_MANIFEST_URL, { cache: 'no-store' })
  if (!manifestResponse.ok) throw new Error('Unable to load the service worker build manifest')
  const manifest = await manifestResponse.clone().json()
  if (manifest.version !== self.__LETSBOULDER_BUILD_VERSION
    || !MAPLIBRE_ASSETS.every((asset) => manifest.assets?.includes(asset))) {
    throw new Error('Service worker build manifest does not match this release')
  }
  await Promise.all(MAPLIBRE_ASSETS.map(async (asset) => {
    const response = await fetch(asset, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to cache MapLibre asset: ${asset}`)
    await staticCache.put(asset, response)
  }))
  await shellCache.put(BUILD_ASSET_MANIFEST_URL, manifestResponse)

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
  const cachedAcrossReleases = await caches.match(request)
  if (cachedAcrossReleases) return cachedAcrossReleases

  const cache = await caches.open(await getStaticCacheName())
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function cacheFirstMapLibre(request) {
  const cache = await caches.open(await getStaticCacheName())
  // Stable module URLs must never be resolved from a previous release's cache.
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request, { cache: 'no-store' })
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function cacheFirstPackedMedia(request) {
  const cache = await caches.open(PACKED_MEDIA_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return new Response('', { status: 504, statusText: 'Offline media unavailable' })
  }
}

function isPackedMediaRequest(request, url) {
  return request.destination === 'image'
    && APPROVED_MEDIA_ORIGINS.has(url.origin)
    && PACKED_MEDIA_PATH.test(url.pathname)
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

async function offlineNavigationCacheFirst(request) {
  const pathname = new URL(request.url).pathname
  const shellCache = await caches.open(SHELL_CACHE)
  const cached = await shellCache.match(pathname)
  return cached || navigationNetworkFirst(request)
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const currentStaticCache = await getStaticCacheName()
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter((name) => (name.startsWith(STATIC_CACHE_PREFIX) && name !== currentStaticCache) || RETIRED_CACHE_NAMES.has(name))
      .map((name) => caches.delete(name)))
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
    event.respondWith(SHELL_PATHS.includes(url.pathname)
      ? offlineNavigationCacheFirst(request)
      : navigationNetworkFirst(request))
  } else if (url.origin === self.location.origin && MAPLIBRE_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstMapLibre(request))
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstStatic(request))
  } else if (isPackedMediaRequest(request, url)) {
    event.respondWith(cacheFirstPackedMedia(request))
  }
})
