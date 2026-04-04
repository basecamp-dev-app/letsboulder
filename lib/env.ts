import { z } from 'zod'

const isTest = process.env.NODE_ENV === 'test'

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default(isTest ? 'http://127.0.0.1:54321' : ''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default(isTest ? 'test-anon-key' : ''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default(isTest ? 'test-service-role-key' : ''),

  R2_S3_ENDPOINT: z.string().url().default(isTest ? 'https://test.r2.cloudflarestorage.com' : ''),
  R2_PRIVATE_BUCKET: z.string().min(1).default(isTest ? 'test-private' : ''),
  R2_PUBLIC_BUCKET: z.string().min(1).default(isTest ? 'test-public' : ''),
  R2_ACCESS_KEY_ID: z.string().min(1).default(isTest ? 'test-key-id' : ''),
  R2_SECRET_ACCESS_KEY: z.string().min(1).default(isTest ? 'test-secret-key' : ''),

  NEXT_PUBLIC_MEDIA_CDN_URL: z.string().url().default(isTest ? 'https://test-cdn.example.com' : ''),

  CSRF_SECRET: z.string().min(1).optional(),
  DELETE_ACCOUNT_SECRET: z.string().min(1).optional(),
  INTERNAL_MODERATION_SECRET: z.string().min(1).default(isTest ? 'test-mod-secret' : ''),

  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_ALLOW_PENDING_IMAGES: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : false),
    z.boolean().default(false),
  ),
  NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS: z.preprocess(
    (v) => v === '1',
    z.boolean().default(false),
  ),

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

  SENTRY_DSN: z.string().optional(),
})

function parseServerEnv(): z.infer<typeof serverEnvSchema> {
  try {
    return serverEnvSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      const message = `Invalid environment variables:\n${issues.join('\n')}\n\nSee .env.example for required variables.`

      if (process.env.NODE_ENV === 'production') {
        console.error(message)
        process.exit(1)
      }
      throw new Error(message)
    }
    throw error
  }
}

export const serverEnv = parseServerEnv()
