export const VIDEO_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'vimeo', 'other'] as const

export type VideoPlatform = typeof VIDEO_PLATFORMS[number]

const ALLOWED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'instagram.com',
  'www.instagram.com',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'vimeo.com',
  'www.vimeo.com',
] as const

export function isAllowedVideoHost(hostname: string): boolean {
  return ALLOWED_HOSTS.includes(hostname as (typeof ALLOWED_HOSTS)[number])
}

export function detectVideoPlatform(url: URL): VideoPlatform {
  const host = url.hostname.toLowerCase()

  if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube'
  if (host.includes('instagram.com')) return 'instagram'
  if (host.includes('tiktok.com')) return 'tiktok'
  if (host.includes('vimeo.com')) return 'vimeo'

  return 'other'
}

export function validateAndNormalizeVideoUrl(rawUrl: string): { valid: boolean; url?: string; platform?: VideoPlatform; error?: string } {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return { valid: false, error: 'Video URL is required' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, error: 'Please enter a valid URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https URLs are allowed' }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!isAllowedVideoHost(hostname)) {
    return { valid: false, error: 'Only YouTube, Instagram, TikTok, and Vimeo links are supported' }
  }

  return {
    valid: true,
    url: parsed.toString(),
    platform: detectVideoPlatform(parsed),
  }
}

export function getVideoEmbedUrl(url: string, platform: VideoPlatform): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (platform === 'youtube') {
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    const directPath = parsed.pathname.split('/').filter(Boolean)
    if (directPath[0] === 'embed' && directPath[1]) {
      return `https://www.youtube.com/embed/${directPath[1]}`
    }

    if (directPath[0] === 'shorts' && directPath[1]) {
      return `https://www.youtube.com/embed/${directPath[1]}`
    }

    const id = parsed.searchParams.get('v')
    return id ? `https://www.youtube.com/embed/${id}` : null
  }

  if (platform === 'vimeo') {
    const id = parsed.pathname.split('/').filter(Boolean)[0]
    return id ? `https://player.vimeo.com/video/${id}` : null
  }

  return null
}
