/**
 * Single source of truth for all rate limit configurations.
 * Used by: lib/rate-limit.ts (app-layer), lib/upstash-redis.ts (Redis-layer), proxy.ts (edge middleware)
 */

export interface RateLimitTier {
  tokens: number
  windowMs: number
  window: string
  prefix: string
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  externalApi: { tokens: 30, windowMs: 60_000, window: '60 s', prefix: 'rl:api:external' },
  geoDetect: { tokens: 5, windowMs: 60_000, window: '60 s', prefix: 'rl:api:geo' },
  clickSink: { tokens: 10, windowMs: 60_000, window: '60 s', prefix: 'rl:api:clicks' },
  authenticatedWrite: { tokens: 50, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:write' },
  publicSearch: { tokens: 100, windowMs: 60_000, window: '60 s', prefix: 'rl:api:search' },
  sensitive: { tokens: 10, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:sensitive' },
  strict: { tokens: 5, windowMs: 60_000, window: '60 s', prefix: 'rl:api:strict' },
  rankings: { tokens: 120, windowMs: 60_000, window: '60 s', prefix: 'rl:api:rankings' },
  submissions: { tokens: 20, windowMs: 60_000, window: '60 s', prefix: 'rl:api:submissions' },
  signedUrls: { tokens: 30, windowMs: 60_000, window: '60 s', prefix: 'rl:api:signed-urls' },
  uploadSessionCreate: { tokens: 12, windowMs: 60_000, window: '60 s', prefix: 'rl:api:upload-session-create' },
  uploadSessionComplete: { tokens: 20, windowMs: 60_000, window: '60 s', prefix: 'rl:api:upload-session-complete' },
} as const

/**
 * Proxy-specific bucket mapping (edge middleware uses snake_case bucket names).
 * Maps proxy bucket names to the canonical tier key.
 */
export const PROXY_BUCKET_TO_TIER: Record<string, keyof typeof RATE_LIMIT_TIERS> = {
  geo: 'geoDetect',
  clicks: 'clickSink',
  search: 'publicSearch',
  rankings: 'rankings',
  upload_session_create: 'uploadSessionCreate',
  upload_session_complete: 'uploadSessionComplete',
  signed_urls: 'signedUrls',
  submissions: 'submissions',
  write: 'authenticatedWrite',
}
