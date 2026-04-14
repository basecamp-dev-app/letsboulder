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

async function collectAssetRequestsFromPage(pageUrl, options = {}) {
  if (!pageUrl || pageUrl.startsWith('/api/')) return []

  const {
    required = false,
  } = options

  try {
    const response = await fetch(toSameOriginRequest(pageUrl))
    if (!response.ok) {
      if (required) {
        throw new Error(`Failed to fetch offline page ${pageUrl}`)
      }
      return []
    }

    const html = await response.text()
    const requests = new Map()
    const assetMatches = html.matchAll(/(?:href|src)="(\/_next\/(?:static\/[^"]+\.(?:css|js)|image\?[^\"]+))"/g)

    for (const match of assetMatches) {
      const assetUrl = match[1]
      if (!assetUrl) continue
      requests.set(assetUrl, toSameOriginRequest(assetUrl))
    }

    return Array.from(requests.values())
  } catch (error) {
    if (required) {
      throw error instanceof Error ? error : new Error(`Failed to discover offline page assets for ${pageUrl}`)
    }
    return []
  }
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
    const pageRequests = await collectAssetRequestsFromPage(pageUrl)
    for (const request of pageRequests) {
      requests.set(request.url, request)
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

async function cacheRequiredPageAssets(pageUrls) {
  const requests = new Map()

  for (const pageUrl of pageUrls) {
    const pageRequests = await collectAssetRequestsFromPage(pageUrl, { required: true })
    for (const request of pageRequests) {
      requests.set(request.url, request)
    }
  }

  if (requests.size === 0) {
    throw new Error('Failed to discover required offline route assets')
  }

  await cacheUrls(ROUTE_ASSET_CACHE, Array.from(requests.keys()))
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
