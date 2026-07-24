import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/errors'
import { RATE_LIMIT_TIERS } from '@/lib/rate-limit-config'

interface UpstashRedisClient {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>
}

type UpstashRedisCtor = new (args: { url: string; token: string }) => UpstashRedisClient

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
  fallbackMode: 'local-bucket' | 'fail-open'
}

let upstashDepsPromise: Promise<UpstashDeps | null> | null = null
let redisClient: UpstashRedisClient | null = null
let upstashUnavailableWarningLogged = false
const limiterCache = new Map<string, RateLimiterInstance>()

interface InMemoryBucket {
  count: number
  resetAt: number
}
const inMemoryFallback = new Map<string, InMemoryBucket>()
let fallbackAlertLogged = false

function getUpstashConfig() {
  return {
    url: serverEnv.UPSTASH_REDIS_REST_URL,
    token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
  }
}

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = Object.fromEntries(
  Object.entries(RATE_LIMIT_TIERS).map(([key, tier]) => [
    key,
    { tokens: tier.tokens, window: tier.window, prefix: tier.prefix, fallbackMode: tier.fallbackMode },
  ])
)

async function loadUpstashDeps(): Promise<UpstashDeps | null> {
  const { url, token } = getUpstashConfig()

  if (!upstashDepsPromise) {
    if (!url || !token) {
      if (!upstashUnavailableWarningLogged) {
        upstashUnavailableWarningLogged = true
        reportError(new Error('Upstash Redis credentials not configured; rate limiting will use fallback'), {
          message: 'Upstash Redis credentials not configured; rate limiting will use fallback',
          level: 'warning',
        })
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
          reportError(new Error('Upstash rate limiting dependencies missing; skipping'), {
            message: 'Upstash rate limiting dependencies missing; skipping',
            level: 'warning',
          })
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
  const { url, token } = getUpstashConfig()
  if (!deps || !url || !token) return null

  redisClient = new deps.Redis({ url, token })
  return redisClient
}

export async function getRateLimiter(configKey: string): Promise<RateLimiterInstance | null> {
  const cached = limiterCache.get(configKey)
  if (cached) return cached

  const config = RATE_LIMIT_CONFIGS[configKey]
  if (!config) {
    reportError(new Error(`Unknown rate limit config key: ${configKey}`), {
      message: 'Unknown rate limit config key',
      level: 'warning',
      extra: { configKey },
    })
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
    reportRateLimitFallback(new Error('Upstash Redis unavailable; rate limiting using fallback'))
    return applyRateLimitFallback(identifier, configKey)
  }

  try {
    return await limiter.limit(identifier)
  } catch (error) {
    reportRateLimitFallback(error)
    return applyRateLimitFallback(identifier, configKey)
  }
}

function reportRateLimitFallback(error: unknown) {
  if (fallbackAlertLogged) return
  fallbackAlertLogged = true
  reportError(error, {
    message: 'Rate limiting fallback activated',
    level: 'warning',
  })
}

function applyRateLimitFallback(
  identifier: string,
  configKey: string
): { success: boolean; limit: number; remaining: number; reset: number } {
  const config = RATE_LIMIT_CONFIGS[configKey]
  if (config?.fallbackMode === 'local-bucket') {
    const now = Date.now()
    const windowMs = parseWindowMs(config.window)
    const key = `${config.prefix}:${identifier}`
    let bucket = inMemoryFallback.get(key)

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      inMemoryFallback.set(key, bucket)
    }

    bucket.count++
    return {
      success: bucket.count <= config.tokens,
      limit: config.tokens,
      remaining: Math.max(0, config.tokens - bucket.count),
      reset: bucket.resetAt,
    }
  }

  return { success: true, limit: 9999, remaining: 9999, reset: Date.now() + 60000 }
}

function parseWindowMs(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h)$/i)
  if (!match) return 60_000
  const value = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  if (unit === 's') return value * 1000
  if (unit === 'm') return value * 60 * 1000
  if (unit === 'h') return value * 60 * 60 * 1000
  return 60_000
}

export function isUpstashConfigured(): boolean {
  const { url, token } = getUpstashConfig()
  return !!(url && token)
}
