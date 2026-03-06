self.__WB_DISABLE_DEV_LOGS = true

const PACK_CACHE = 'offline-climb-packs-v1'
const MEDIA_CACHE = 'offline-media-v1'
const TRANSIENT_CACHE = 'runtime-transient-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

async function cacheUrls(cacheName, urls) {
  const cache = await caches.open(cacheName)

  for (const url of urls) {
    if (!url) continue

    const request = new Request(url, { credentials: 'same-origin' })
    const response = await fetch(request)
    if (!response.ok) {
      throw new Error(`Failed to cache ${url}`)
    }

    await cache.put(request, response.clone())
  }
}

async function removeUrls(cacheName, urls) {
  const cache = await caches.open(cacheName)
  await Promise.all(urls.map((url) => cache.delete(new Request(url, { credentials: 'same-origin' }))))
}

self.addEventListener('message', (event) => {
  const reply = event.ports && event.ports[0]
  const message = event.data || {}

  const respond = (payload) => {
    if (reply) reply.postMessage(payload)
  }

  event.waitUntil((async () => {
    try {
      if (message.type === 'SAVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const packUrls = [pack.pageUrl, pack.manifestUrl].filter(Boolean)
        await cacheUrls(PACK_CACHE, packUrls)
        await cacheUrls(MEDIA_CACHE, mediaUrls)
        respond({ ok: true })
        return
      }

      if (message.type === 'REMOVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const packUrls = [pack.pageUrl, pack.manifestUrl].filter(Boolean)
        await removeUrls(PACK_CACHE, packUrls)
        await removeUrls(MEDIA_CACHE, mediaUrls)
        respond({ ok: true })
        return
      }

      respond({ ok: false, error: 'Unsupported service worker action' })
    } catch (error) {
      respond({ ok: false, error: error instanceof Error ? error.message : 'Service worker action failed' })
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isMediaRequest = url.pathname.startsWith('/api/media/')
  const isPackRequest = url.pathname.startsWith('/api/offline-packs/climbs/')
  const isClimbPage = request.mode === 'navigate' && url.pathname.startsWith('/climb/')

  if (isMediaRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) {
        await cache.put(request, response.clone())
      }
      return response
    })())
    return
  }

  if (isPackRequest || isClimbPage) {
    event.respondWith((async () => {
      const cache = await caches.open(PACK_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        if (cached) return cached
        throw error
      }
    })())
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(TRANSIENT_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) {
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})
