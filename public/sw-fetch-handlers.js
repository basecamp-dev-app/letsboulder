async function handleShellFetch(request) {
  const url = new URL(request.url)

  try {
    const response = await fetch(request)
    if (response.ok) {
      const shellCache = await caches.open(SHELL_CACHE)
      await shellCache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await matchShellRequest(request)
    if (cached) return cached
    if (request.mode === 'navigate' && url.pathname === OFFLINE_LAUNCH_URL) {
      const fallback = await matchShellRequest(toSameOriginRequest(OFFLINE_LAUNCH_URL))
      if (fallback) return fallback
    }

    if (request.mode === 'navigate') {
      const offlineLibraryFallback = await matchShellRequest(toSameOriginRequest(OFFLINE_LIBRARY_URL))
      if (offlineLibraryFallback) return offlineLibraryFallback

      const homeFallback = await matchShellRequest(toSameOriginRequest(HOME_URL))
      if (homeFallback) return homeFallback
    }

    return Response.error()
  }
}

async function handleRouteAssetFetch(request) {
  const cached = await matchRouteAssetRequest(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
      await routeAssetCache.put(request, response.clone())
    }
    return response
  } catch {
    const fallback = await matchRouteAssetRequest(request)
    if (fallback) return fallback
    return new Response('', { status: 503, statusText: 'Offline route asset unavailable' })
  }
}
