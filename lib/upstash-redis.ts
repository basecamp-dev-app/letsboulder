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
}

let upstashDepsPromise: Promise<UpstashDeps | null> | null = null
let redisClient: UpstashRedisClient | null = null
let upstashUnavailableWarningLogged = false
const limiterCache = new Map<string, RateLimiterInstance>()

const CRITICAL_TIERS = new Set(['sensitive', 'strict', 'submissions'])

interface InMemoryBucket {
  count: number
  resetAt: number
}
const inMemoryFallback = new Map<string, InMemoryBucket>()
let fallbackAlertLogged = false

const UPSTASH_URL = serverEnv.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = serverEnv.UPSTASH_REDIS_REST_TOKEN

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = Object.fromEntries(
  Object.entries(RATE_LIMIT_TIERS).map(([key, tier]) => [
    key,
    { tokens: tier.tokens, window: tier.window, prefix: tier.prefix },
  ])
)

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
    if (!fallbackAlertLogged) {
      fallbackAlertLogged = true
      reportError(new Error('Upstash Redis unavailable; rate limiting using in-memory fallback'), {
        message: 'Rate limiting fallback activated',
        level: 'warning',
      })
    }

    const config = RATE_LIMIT_CONFIGS[configKey]
    const isCritical = CRITICAL_TIERS.has(configKey)

    if (isCritical && config) {
      const now = Date.now()
      const windowMs = parseWindowMs(config.window)
      const key = `${config.prefix}:${identifier}`
      let bucket = inMemoryFallback.get(key)

      if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs }
        inMemoryFallback.set(key, bucket)
      }

      bucket.count++
      const allowed = bucket.count <= config.tokens
      return {
        success: allowed,
        limit: config.tokens,
        remaining: Math.max(0, config.tokens - bucket.count),
        reset: bucket.resetAt,
      }
    }

    return { success: true, limit: 9999, remaining: 9999, reset: Date.now() + 60000 }
  }

  return limiter.limit(identifier)
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
  return !!(UPSTASH_URL && UPSTASH_TOKEN)
}
