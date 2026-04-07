import { z } from 'zod'
import { EnvValidationError, getSharedEnv, type SharedEnv } from '@/lib/env'

const isTest = process.env.NODE_ENV === 'test'

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CSRF_SECRET: z.string().min(1),
  DELETE_ACCOUNT_SECRET: z.string().min(1),
  INTERNAL_MODERATION_SECRET: z.string().min(1).optional(),
  R2_S3_ENDPOINT: z.string().url(),
  R2_PRIVATE_BUCKET: z.string().min(1),
  R2_PUBLIC_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  MEDIA_MODERATION_ENABLED: z.preprocess(
    (v) => (v === 'false' ? false : v === 'true' ? true : true),
    z.boolean().default(true),
  ),
  MEDIA_MODERATION_PROVIDER: z.string().optional(),
  MEDIA_MODERATION_FAIL_OPEN: z.preprocess(
    (v) => v === 'true',
    z.boolean().default(false),
  ),
  DISCORD_SUBMISSIONS_WEBHOOK_URL: z.string().optional(),
  DISCORD_FLAGS_WEBHOOK_URL: z.string().optional(),
  DISCORD_GYM_OWNERS_WEBHOOK_URL: z.string().optional(),
  DISCORD_FEEDBACK_WEBHOOK_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
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

export function getServerEnv(): ServerEnv {
  if (serverEnvCache) return serverEnvCache

  try {
    serverEnvCache = {
      ...getSharedEnv(),
      ...serverOnlyEnvSchema.parse(process.env),
    }
    return serverEnvCache
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      throw new EnvValidationError(issues)
    }

    throw error
  }
}

export function validateServerEnv(): void {
  if (process.env.ENABLE_TEST_AUTH_ENDPOINT === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: ENABLE_TEST_AUTH_ENDPOINT cannot be enabled in production')
  }
  getServerEnv()
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, property, receiver) {
    return Reflect.get(getServerEnv(), property, receiver)
  },
})
