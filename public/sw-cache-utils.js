function toSameOriginRequest(url) {
  return new Request(url, { credentials: 'same-origin' })
}

function extractAssetRequests(html) {
  const requests = new Map()
  const assetMatches = html.matchAll(/(?:href|src)="(\/(?:_next\/(?:static\/[^"?]+\.(?:css|js|woff2?|ttf|otf|eot)|static\/media\/[^"?]+|image\?[^\"]+)|theme-init\.js))"/g)

  for (const match of assetMatches) {
    const assetUrl = match[1]
    if (!assetUrl) continue
    requests.set(assetUrl, toSameOriginRequest(assetUrl))
  }

  return Array.from(requests.values())
}

async function collectBuildManifestAssetRequests() {
  try {
    const response = await fetch(toSameOriginRequest(BUILD_MANIFEST_URL))
    if (!response.ok) return []

    const manifest = await response.json()
    const urls = new Set()

    const addAsset = (assetUrl) => {
      if (typeof assetUrl !== 'string') return
      if (!assetUrl.startsWith('/_next/')) return
      urls.add(assetUrl)
    }

    const addAssets = (value) => {
      if (Array.isArray(value)) {
        for (const assetUrl of value) addAsset(assetUrl)
        return
      }

      if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) {
          addAssets(nested)
        }
      }
    }

    addAssets(manifest)
    return Array.from(urls, (assetUrl) => toSameOriginRequest(assetUrl))
  } catch {
    return []
  }
}

function toStaticAssetUrl(assetPath) {
  if (typeof assetPath !== 'string') return null
  if (assetPath.startsWith('/_next/')) return assetPath
  if (assetPath.startsWith('static/')) return `/_next/${assetPath}`
  return null
}

async function collectJson(url, options = {}) {
  const {
    required = false,
  } = options

  try {
    const response = await fetch(toSameOriginRequest(url))
    if (!response.ok) {
      if (required) {
        throw new Error(`Failed to fetch offline manifest ${url}`)
      }
      return null
    }

    return await response.json()
  } catch (error) {
    if (required) {
      throw error instanceof Error ? error : new Error(`Failed to fetch offline manifest ${url}`)
    }
    return null
  }
}

function normalizePageUrlToRoutePath(pageUrl) {
  if (!pageUrl || pageUrl.startsWith('/api/')) return null

  const pathname = pageUrl.split('?')[0] || pageUrl
  if (pathname === HOME_URL || pathname === OFFLINE_LAUNCH_URL || pathname === OFFLINE_LIBRARY_URL) {
    return pathname
  }

  if (pathname.startsWith('/climb/')) return '/climb/[id]'

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 2 && /^[a-z]{2}$/i.test(segments[0] || '')) {
    return '/[country]/[crag]'
  }

  return null
}

function getReactLoadableManifestUrlForRoute(routePath) {
  switch (routePath) {
    case '/':
      return '/_next/server/app/(shell)/page/react-loadable-manifest.json'
    case '/offline':
      return '/_next/server/app/offline/page/react-loadable-manifest.json'
    case '/offline/library':
      return '/_next/server/app/offline/library/page/react-loadable-manifest.json'
    case '/climb/[id]':
      return '/_next/server/app/climb/[id]/page/react-loadable-manifest.json'
    case '/[country]/[crag]':
      return '/_next/server/app/[country]/[crag]/page/react-loadable-manifest.json'
    default:
      return null
  }
}

async function collectReactLoadableAssetRequests(pageUrls) {
  const requests = new Map()
  const routePaths = new Set(pageUrls.map((pageUrl) => normalizePageUrlToRoutePath(pageUrl)).filter(Boolean))

  for (const routePath of routePaths) {
    const manifestUrl = getReactLoadableManifestUrlForRoute(routePath)
    if (!manifestUrl) continue

    const manifest = await collectJson(manifestUrl)
    if (!manifest || typeof manifest !== 'object') continue

    for (const entry of Object.values(manifest)) {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.files)) continue
      for (const file of entry.files) {
        const assetUrl = toStaticAssetUrl(file)
        if (!assetUrl) continue
        requests.set(assetUrl, toSameOriginRequest(assetUrl))
      }
    }
  }

  return Array.from(requests.values())
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
    return extractAssetRequests(html)
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
      for (const request of extractAssetRequests(html)) {
        requests.set(request.url, request)
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
  const [shellAssetRequests, buildManifestAssetRequests] = await Promise.all([
    collectShellAssetRequests(),
    collectBuildManifestAssetRequests(),
  ])
  await cacheRequests(SHELL_CACHE, [...shellRequests, ...shellAssetRequests, ...buildManifestAssetRequests])
}

async function cachePageAssets(pageUrls) {
  const assetRequests = await collectPageAssetRequests(pageUrls)
  if (assetRequests.length === 0) return
  await cacheRequests(ROUTE_ASSET_CACHE, assetRequests)
}

async function cacheRequiredPageAssets(pageUrls) {
  const requests = new Map()
  const [buildManifestRequests, reactLoadableRequests] = await Promise.all([
    collectBuildManifestAssetRequests(),
    collectReactLoadableAssetRequests(pageUrls),
  ])

  for (const pageUrl of pageUrls) {
    const pageRequests = await collectAssetRequestsFromPage(pageUrl, { required: true })
    for (const request of pageRequests) {
      requests.set(request.url, request)
    }
  }

  for (const request of buildManifestRequests) {
    requests.set(request.url, request)
  }

  for (const request of reactLoadableRequests) {
    requests.set(request.url, request)
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

if (typeof globalThis !== 'undefined') {
  globalThis.collectAssetRequestsFromPage = collectAssetRequestsFromPage
  globalThis.collectShellAssetRequests = collectShellAssetRequests
  globalThis.cacheRequiredPageAssets = cacheRequiredPageAssets
}
