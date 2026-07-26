const RETIRED_CACHE_PREFIX = 'offline-'
const RETIRED_TRANSIENT_CACHE = 'runtime-transient-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith(RETIRED_CACHE_PREFIX) || cacheName === RETIRED_TRANSIENT_CACHE)
      .map((cacheName) => caches.delete(cacheName)))
    await self.registration.unregister()
  })())
})
