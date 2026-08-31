const SCRIPT_SOURCES = ["'self'", "'unsafe-inline'", 'https://sentry.io']

function getConfiguredMediaOrigin(mediaCdnUrl: string | undefined): string | null {
  if (!mediaCdnUrl) return null

  try {
    const parsed = new URL(mediaCdnUrl)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null
  } catch {
    return null
  }
}

export function getContentSecurityPolicy(
  environment = process.env.NODE_ENV,
  mediaCdnUrl = process.env.NEXT_PUBLIC_MEDIA_CDN_URL,
): string {
  const scriptSources = [...SCRIPT_SOURCES]
  const configuredMediaOrigin = getConfiguredMediaOrigin(mediaCdnUrl)
  const mediaSources = [
    'https://static.letsboulder.com',
    'https://static.dev.letsboulder.com',
    ...(configuredMediaOrigin ? [configuredMediaOrigin] : []),
  ]

  if (environment === 'development') {
    scriptSources.splice(1, 0, "'unsafe-eval'")
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.supabase.co https://*.cloudflarestorage.com https://media-letsboulder.pages.dev https://server.arcgisonline.com ${mediaSources.join(' ')} https://tiles.openfreemap.org https://lh3.googleusercontent.com`,
    `connect-src 'self' http://127.0.0.1:54321 http://localhost:54321 https://*.supabase.co https://*.cloudflarestorage.com https://*.sentry.io ${mediaSources.join(' ')} https://tiles.openfreemap.org wss://*.supabase.co`,
    "font-src 'self' https://tiles.openfreemap.org",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ]

  return `${directives.join('; ')};`
}
