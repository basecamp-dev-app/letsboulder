async function handleShellFetch(request) {
  if (request.mode === 'navigate') {
    return handleNavigationFetch(request)
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
    if (request.mode === 'navigate') {
      return getOfflineNavigationFallback()
    }
    return new Response('', { status: 503, statusText: 'Offline shell unavailable' })
  }
}

async function handleNavigationFetch(request) {
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
    return getOfflineNavigationFallback()
  }
}

async function getOfflineNavigationFallback() {
  const fallback = await matchShellRequest(toSameOriginRequest(OFFLINE_URL))
  if (fallback) return fallback

  return new Response('<!doctype html><title>Offline</title><main><h1>You are offline</h1><p>Only cached content is available right now.</p></main>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
    status: 503,
    statusText: 'Offline fallback unavailable',
  })
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
  globalThis.handleNavigationFetch = handleNavigationFetch
  globalThis.handleRouteAssetFetch = handleRouteAssetFetch
}
