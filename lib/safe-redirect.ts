const LOCAL_REDIRECT_ORIGIN = 'https://letsboulder.local'

export function getSafeRedirect(value: string | null, fallback = '/'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback

  try {
    const url = new URL(value, LOCAL_REDIRECT_ORIGIN)
    if (url.origin !== LOCAL_REDIRECT_ORIGIN) return fallback

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
