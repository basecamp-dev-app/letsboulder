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
  const buildAssetCache = await caches.open(await getBuildAssetCacheName())
  const sharedBuildMatch = await buildAssetCache.match(request)
  if (sharedBuildMatch) return sharedBuildMatch

  const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
  const directMatch = await routeAssetCache.match(request)
  if (directMatch) return directMatch

  const shellCache = await caches.open(SHELL_CACHE)
  return shellCache.match(request)
}
