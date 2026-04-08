/**
 * Single source of truth for all rate limit configurations.
 * Used by: lib/rate-limit.ts (app-layer), lib/upstash-redis.ts (Redis-layer), proxy.ts (edge middleware)
 */

export interface RateLimitTier {
  tokens: number
  windowMs: number
  window: string
  prefix: string
  fallbackMode: 'local-bucket' | 'fail-open'
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  externalApi: { tokens: 30, windowMs: 60_000, window: '60 s', prefix: 'rl:api:external', fallbackMode: 'local-bucket' },
  geoDetect: { tokens: 5, windowMs: 60_000, window: '60 s', prefix: 'rl:api:geo', fallbackMode: 'fail-open' },
  clickSink: { tokens: 10, windowMs: 60_000, window: '60 s', prefix: 'rl:api:clicks', fallbackMode: 'fail-open' },
  authenticatedWrite: { tokens: 50, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:write', fallbackMode: 'local-bucket' },
  draftSave: { tokens: 200, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:draft-save', fallbackMode: 'local-bucket' },
  draftPublish: { tokens: 20, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:draft-publish', fallbackMode: 'local-bucket' },
  publicSearch: { tokens: 100, windowMs: 60_000, window: '60 s', prefix: 'rl:api:search', fallbackMode: 'local-bucket' },
  sensitive: { tokens: 10, windowMs: 60 * 60 * 1000, window: '60 m', prefix: 'rl:api:sensitive', fallbackMode: 'local-bucket' },
  strict: { tokens: 5, windowMs: 60_000, window: '60 s', prefix: 'rl:api:strict', fallbackMode: 'local-bucket' },
  rankings: { tokens: 120, windowMs: 60_000, window: '60 s', prefix: 'rl:api:rankings', fallbackMode: 'fail-open' },
  submissions: { tokens: 20, windowMs: 60_000, window: '60 s', prefix: 'rl:api:submissions', fallbackMode: 'local-bucket' },
  signedUrls: { tokens: 30, windowMs: 60_000, window: '60 s', prefix: 'rl:api:signed-urls', fallbackMode: 'local-bucket' },
  uploadSessionCreate: { tokens: 12, windowMs: 60_000, window: '60 s', prefix: 'rl:api:upload-session-create', fallbackMode: 'local-bucket' },
  uploadSessionComplete: { tokens: 20, windowMs: 60_000, window: '60 s', prefix: 'rl:api:upload-session-complete', fallbackMode: 'local-bucket' },
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
