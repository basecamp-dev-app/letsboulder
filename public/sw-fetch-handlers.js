async function handleShellFetch(request) {
  const url = new URL(request.url)
  const isHomeNavigation = request.mode === 'navigate' && url.pathname === HOME_URL

  if (isHomeNavigation) {
    try {
      return await fetch(request)
    } catch {
      const cachedHome = await matchShellRequest(request)
      if (cachedHome) return cachedHome
      return Response.error()
    }
  }

  const cached = await matchShellRequest(request)

  if (cached) {
    void (async () => {
      try {
        const response = await fetch(request)
        if (!response.ok) return

        const shellCache = await caches.open(SHELL_CACHE)
        await shellCache.put(request, response.clone())
      } catch {
        // Ignore background refresh failures and continue serving cached content.
      }
    })()

    return cached
  }

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
    return Response.error()
  }
}

async function handleRouteAssetFetch(request) {
  const cached = await matchRouteAssetRequest(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (!response.ok) return response

    const routeAssetCache = await caches.open(ROUTE_ASSET_CACHE)
    await routeAssetCache.put(request, response.clone())
    return response
  } catch {
    const fallback = await matchRouteAssetRequest(request)
    if (fallback) return fallback
    return new Response('', { status: 503, statusText: 'Offline route asset unavailable' })
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.handleShellFetch = handleShellFetch
  globalThis.handleRouteAssetFetch = handleRouteAssetFetch
}
