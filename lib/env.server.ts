import { z } from 'zod'
import { getSharedEnv, type SharedEnv } from '@/lib/env'

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  DELETE_ACCOUNT_SECRET: z.string().min(32),
  R2_S3_ENDPOINT: z.string().url(),
  R2_PRIVATE_BUCKET: z.string().min(1),
  R2_PUBLIC_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  DISCORD_SUBMISSIONS_WEBHOOK_URL: z.string().optional(),
  DISCORD_FLAGS_WEBHOOK_URL: z.string().optional(),
  DISCORD_GYM_OWNERS_WEBHOOK_URL: z.string().optional(),
  DISCORD_FEEDBACK_WEBHOOK_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  CF_MEDIA_WORKER_URL: z.string().optional(),
  CF_MEDIA_WORKER_SECRET: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  DEBUG_SUBMISSIONS_AUTH: z.string().optional(),
  DEV_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  INTERNAL_TEST_KEY: z.string().optional(),
  TEST_API_KEY: z.string().optional(),
  TEST_USER_PASSWORD: z.string().optional(),
  TEST_USER_ID: z.string().optional(),
  TEST_AUTH_PATH_SEGMENT: z.string().min(1).optional(),
  SENTRY_DSN: z.string().optional(),
})

export type ServerEnv = SharedEnv & z.infer<typeof serverOnlyEnvSchema>

let serverEnvCache: ServerEnv | null = null

function getPlaceholderServerEnv(): ServerEnv {
  return {
    ...getSharedEnv(),
    SUPABASE_SERVICE_ROLE_KEY: 'build-placeholder',
    CSRF_SECRET: 'build-placeholder',
    DELETE_ACCOUNT_SECRET: 'build-placeholder',
    R2_S3_ENDPOINT: 'https://build.placeholder',
    R2_PRIVATE_BUCKET: 'build-placeholder',
    R2_PUBLIC_BUCKET: 'build-placeholder',
    R2_ACCESS_KEY_ID: 'build-placeholder',
    R2_SECRET_ACCESS_KEY: 'build-placeholder',
    DISCORD_SUBMISSIONS_WEBHOOK_URL: undefined,
    DISCORD_FLAGS_WEBHOOK_URL: undefined,
    DISCORD_GYM_OWNERS_WEBHOOK_URL: undefined,
    DISCORD_FEEDBACK_WEBHOOK_URL: undefined,
    RESEND_API_KEY: undefined,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    TURNSTILE_SECRET_KEY: undefined,
    CF_MEDIA_WORKER_URL: undefined,
    CF_MEDIA_WORKER_SECRET: undefined,
    VERCEL_ENV: undefined,
    VERCEL_URL: undefined,
    DEBUG_SUBMISSIONS_AUTH: undefined,
    DEV_SUPABASE_SERVICE_ROLE_KEY: undefined,
    INTERNAL_TEST_KEY: undefined,
    TEST_API_KEY: undefined,
    TEST_USER_PASSWORD: undefined,
    TEST_USER_ID: undefined,
    TEST_AUTH_PATH_SEGMENT: undefined,
    SENTRY_DSN: undefined,
  }
}

export function getServerEnv(): ServerEnv {
  if (serverEnvCache) return serverEnvCache

  const parsed = serverOnlyEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return getPlaceholderServerEnv()
    }

    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid server environment:\n${issues}`)
  }

  serverEnvCache = {
    ...getSharedEnv(),
    ...parsed.data,
  }

  return serverEnvCache
}

export function validateServerEnv(): void {
  if (process.env.ENABLE_TEST_AUTH_ENDPOINT === 'true' && process.env.VERCEL_ENV === 'production') {
    throw new Error('FATAL: ENABLE_TEST_AUTH_ENDPOINT cannot be enabled in production')
  }
  // Require Upstash and Turnstile in production
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('FATAL: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN required in production')
    }
    if (!process.env.TURNSTILE_SECRET_KEY) {
      throw new Error('FATAL: TURNSTILE_SECRET_KEY required in production')
    }
  }
  // Force validation - will throw if invalid
  const parsed = serverOnlyEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid server environment:\n${issues}`)
  }
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, property, receiver) {
    return Reflect.get(getServerEnv(), property, receiver)
  },
})
