import { serverEnv } from '@/lib/env'

interface UpstashRedisClient {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>
}

type UpstashRedisCtor = new (args: { url: string; token: string }) => UpstashRedisClient

type AnyConstructor = new (...args: unknown[]) => unknown

interface RateLimiterInstance {
  limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>
}

type RatelimitConstructor = {
  new (args: { redis: unknown; limiter: unknown; prefix: string }): RateLimiterInstance
  slidingWindow: (tokens: number, window: unknown) => unknown
}

type UpstashDeps = {
  Redis: UpstashRedisCtor
  Ratelimit: RatelimitConstructor
}

export interface RateLimitConfig {
  tokens: number
  window: string
  prefix: string
}

let upstashDepsPromise: Promise<UpstashDeps | null> | null = null
let redisClient: UpstashRedisClient | null = null
let upstashUnavailableWarningLogged = false
const limiterCache = new Map<string, RateLimiterInstance>()

const UPSTASH_URL = serverEnv.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = serverEnv.UPSTASH_REDIS_REST_TOKEN

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  externalApi: { tokens: 30, window: '60 s', prefix: 'rl:api:external' },
  geoDetect: { tokens: 5, window: '60 s', prefix: 'rl:api:geo' },
  clickSink: { tokens: 10, window: '60 s', prefix: 'rl:api:clicks' },
  authenticatedWrite: { tokens: 50, window: '60 m', prefix: 'rl:api:write' },
  publicSearch: { tokens: 100, window: '60 s', prefix: 'rl:api:search' },
  sensitive: { tokens: 10, window: '60 m', prefix: 'rl:api:sensitive' },
  strict: { tokens: 5, window: '60 s', prefix: 'rl:api:strict' },
  search: { tokens: 60, window: '60 s', prefix: 'rl:api:search' },
  rankings: { tokens: 120, window: '60 s', prefix: 'rl:api:rankings' },
  submissions: { tokens: 20, window: '60 s', prefix: 'rl:api:submissions' },
  signedUrls: { tokens: 30, window: '60 s', prefix: 'rl:api:signed-urls' },
  uploadSessionCreate: { tokens: 12, window: '60 s', prefix: 'rl:api:upload-session-create' },
  uploadSessionComplete: { tokens: 20, window: '60 s', prefix: 'rl:api:upload-session-complete' },
}

async function loadUpstashDeps(): Promise<UpstashDeps | null> {
  if (!upstashDepsPromise) {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      if (!upstashUnavailableWarningLogged) {
        upstashUnavailableWarningLogged = true
        console.warn('Upstash Redis credentials not configured; rate limiting will use fallback')
      }
      return null
    }

    upstashDepsPromise = Promise.all([
      import('@upstash/redis').catch(() => null),
      import('@upstash/ratelimit').catch(() => null),
    ]).then(([redisModule, ratelimitModule]) => {
      if (!redisModule || !ratelimitModule) {
        if (!upstashUnavailableWarningLogged) {
          upstashUnavailableWarningLogged = true
          console.warn('Upstash rate limiting dependencies missing; skipping')
        }
        return null
      }

      return {
        Redis: redisModule.Redis as UpstashRedisCtor,
        Ratelimit: ratelimitModule.Ratelimit as RatelimitConstructor,
      }
    })
  }

  return upstashDepsPromise
}

export async function getUpstashRedis(): Promise<UpstashRedisClient | null> {
  if (redisClient) return redisClient

  const deps = await loadUpstashDeps()
  if (!deps || !UPSTASH_URL || !UPSTASH_TOKEN) return null

  redisClient = new deps.Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  return redisClient
}

export async function getRateLimiter(configKey: string): Promise<RateLimiterInstance | null> {
  const cached = limiterCache.get(configKey)
  if (cached) return cached

  const config = RATE_LIMIT_CONFIGS[configKey]
  if (!config) {
    console.warn(`Unknown rate limit config key: ${configKey}`)
    return null
  }

  const deps = await loadUpstashDeps()
  if (!deps) return null

  const redis = await getUpstashRedis()
  if (!redis) return null

  const limiter = new deps.Ratelimit({
    redis,
    limiter: deps.Ratelimit.slidingWindow(config.tokens, config.window),
    prefix: config.prefix,
  })

  limiterCache.set(configKey, limiter)
  return limiter
}

export async function checkRateLimit(
  identifier: string,
  configKey: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const limiter = await getRateLimiter(configKey)

  if (!limiter) {
    return { success: true, limit: 9999, remaining: 9999, reset: Date.now() + 60000 }
  }

  return limiter.limit(identifier)
}

export function isUpstashConfigured(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN)
}