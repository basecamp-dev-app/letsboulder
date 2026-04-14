function handleMessageEvent(event) {
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

      if (message.type === 'CLEAR_AUTH_CACHES') {
        await caches.delete(MEDIA_CACHE)
        const newMediaCache = await caches.open(MEDIA_CACHE)
        respond({ ok: true })
        return
      }

      if (message.type === 'SAVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const tileUrls = Array.isArray(pack.tileUrls) ? pack.tileUrls : []
        const packUrls = [OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, HOME_URL, `/climb/${pack.climbId}`, pack.pageUrl, pack.offlineLaunchUrl, pack.imageFirstUrl, pack.manifestUrl].filter(Boolean)
        await cacheUrls(PACK_CACHE, packUrls)
        await cachePageAssets(packUrls)
        const mediaFailures = await cacheUrls(MEDIA_CACHE, mediaUrls, { strict: false })
        const tileFailures = await cacheUrls(TILE_CACHE, tileUrls, { strict: false })
        const parts = []
        if (mediaFailures.length > 0) parts.push('some media')
        if (tileFailures.length > 0) parts.push('some map tiles')
        respond({
          ok: true,
          warning: parts.length > 0 ? `Saved offline content, but ${parts.join(' and ')} could not be cached.` : undefined,
          failedMediaUrls: mediaFailures.map((failure) => failure.url),
          failedTileUrls: tileFailures.map((failure) => failure.url),
        })
        return
      }

      if (message.type === 'REMOVE_CLIMB_PACK') {
        const pack = message.payload || {}
        const mediaUrls = Array.isArray(pack.mediaUrls) ? pack.mediaUrls : []
        const tileUrls = Array.isArray(pack.tileUrls) ? pack.tileUrls : []
        const packUrls = [`/climb/${pack.climbId}`, pack.pageUrl, pack.offlineLaunchUrl, pack.imageFirstUrl, pack.manifestUrl].filter(Boolean)
        await removeUrls(PACK_CACHE, packUrls)
        await removeUrls(MEDIA_CACHE, mediaUrls)
        await removeUrls(TILE_CACHE, tileUrls)
        respond({ ok: true })
        return
      }

      if (message.type === 'SAVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        const cragEntryUrls = [payload.canonicalPath, payload.fallbackPath, payload.manifestUrl].filter(Boolean)
        const totalClimbs = climbs.length
        const totalBytes = Number(payload.totalBytes || 0)
        let completedClimbs = 0
        let completedBytes = 0
        const failedMediaUrls = []

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
        await cacheRequiredPageAssets([OFFLINE_LAUNCH_URL, OFFLINE_LIBRARY_URL, HOME_URL, payload.canonicalPath, payload.fallbackPath].filter(Boolean))

        for (const climb of climbs) {
          const climbPackUrls = [`/climb/${climb.climbId}`, climb.pageUrl, climb.offlineLaunchUrl, climb.imageFirstUrl, climb.manifestUrl].filter(Boolean)
          await cacheUrls(PACK_CACHE, climbPackUrls)
          await cacheRequiredPageAssets([`/climb/${climb.climbId}`, climb.pageUrl, climb.offlineLaunchUrl, climb.imageFirstUrl].filter(Boolean))

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

          const climbMediaFailures = await cacheUrls(MEDIA_CACHE, Array.isArray(climb.mediaUrls) ? climb.mediaUrls : [], {
            concurrency: 3,
            strict: false,
          })
          failedMediaUrls.push(...climbMediaFailures.map((failure) => failure.url))

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

        const warningParts = []
        if (failedMediaUrls.length > 0) warningParts.push('some media')
        respond({
          ok: true,
          warning: warningParts.length > 0 ? `Saved offline content, but ${warningParts.join(' and ')} could not be cached.` : undefined,
          failedMediaUrls,
        })
        return
      }

      if (message.type === 'REMOVE_CRAG_PACK') {
        const payload = message.payload || {}
        const climbs = Array.isArray(payload.climbs) ? payload.climbs : []
        await removeUrls(PACK_CACHE, [payload.canonicalPath, payload.fallbackPath, payload.manifestUrl].filter(Boolean))
        for (const climb of climbs) {
          await removeUrls(PACK_CACHE, [`/climb/${climb.climbId}`, climb.pageUrl, climb.offlineLaunchUrl, climb.imageFirstUrl, climb.manifestUrl].filter(Boolean))
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
}
