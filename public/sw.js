self.__WB_DISABLE_DEV_LOGS = true

const PACK_CACHE = 'offline-climb-packs-v1'
const MEDIA_CACHE = 'offline-media-v1'
const TRANSIENT_CACHE = 'runtime-transient-v1'
const OFFLINE_LAUNCH_URL = '/offline'
const OFFLINE_JOB_CHANNEL = 'offline-pack-jobs'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PACK_CACHE)
    await cache.add(new Request(OFFLINE_LAUNCH_URL, { credentials: 'same-origin' }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
  } = options

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

      const response = await fetch(request)
      if (!response.ok) {
        throw new Error(`Failed to cache ${url}`)
      }

      await cache.put(request, response.clone())
      if (onProgress) onProgress(url, false)
    }
  })

  await Promise.all(workers)
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
        const packUrls = [OFFLINE_LAUNCH_URL, pack.pageUrl, pack.manifestUrl].filter(Boolean)
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

      if (message.type === 'SAVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        const totalClimbs = climbs.length
        const totalBytes = Number(payload.totalBytes || 0)
        let completedClimbs = 0
        let completedBytes = 0

        broadcastProgress({
          type: 'OFFLINE_JOB_PROGRESS',
          jobId: payload.jobId,
          phase: 'cache-pages',
          completedClimbs,
          totalClimbs,
          completedBytes,
          totalBytes,
        })

        await cacheUrls(PACK_CACHE, [OFFLINE_LAUNCH_URL, payload.canonicalPath, payload.manifestUrl].filter(Boolean))

        for (const climb of climbs) {
          await cacheUrls(PACK_CACHE, [climb.pageUrl, climb.manifestUrl].filter(Boolean))

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

        respond({ ok: true })
        return
      }

      if (message.type === 'REMOVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        await removeUrls(PACK_CACHE, [payload.canonicalPath, payload.manifestUrl].filter(Boolean))
        for (const climb of climbs) {
          await removeUrls(PACK_CACHE, [climb.pageUrl, climb.manifestUrl].filter(Boolean))
          await removeUrls(MEDIA_CACHE, Array.isArray(climb.mediaUrls) ? climb.mediaUrls : [])
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
  const isPackRequest = url.pathname.startsWith('/api/offline-packs/climbs/') || url.pathname.startsWith('/api/offline-packs/crags/')
  const isOfflineLaunch = request.mode === 'navigate' && url.pathname === OFFLINE_LAUNCH_URL
  const isClimbPage = request.mode === 'navigate' && url.pathname.startsWith('/climb/')
  const isCragPage = request.mode === 'navigate' && (url.pathname.startsWith('/crag/') || /^\/[a-z]{2}\//.test(url.pathname))

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

  if (isOfflineLaunch || isPackRequest || isClimbPage || isCragPage) {
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

        if (request.mode === 'navigate') {
          const offlineFallback = await cache.match(new Request(OFFLINE_LAUNCH_URL, { credentials: 'same-origin' }))
          if (offlineFallback) return offlineFallback
        }

        throw error
      }
    })())
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request)
      } catch (error) {
        const cache = await caches.open(PACK_CACHE)
        const offlineFallback = await cache.match(new Request(OFFLINE_LAUNCH_URL, { credentials: 'same-origin' }))
        if (offlineFallback) return offlineFallback
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
