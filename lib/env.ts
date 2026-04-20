import { z } from 'zod'

const isTest = process.env.NODE_ENV === 'test'

export class EnvValidationError extends Error {
  issues: string[]

  constructor(issues: string[]) {
    super(`Invalid environment variables:\n${issues.join('\n')}\n\nSee .env.example for required variables.`)
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

const sharedEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_MEDIA_CDN_URL: z.string().optional(),
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
})

export type SharedEnv = z.infer<typeof sharedEnvSchema>

let sharedEnvCache: SharedEnv | null = null

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
}

export function getSharedEnv(): SharedEnv {
  if (sharedEnvCache) return sharedEnvCache

  try {
    sharedEnvCache = sharedEnvSchema.parse(process.env)
    return sharedEnvCache
  } catch (error) {
    if (error instanceof z.ZodError) {
      if (isTest) {
        sharedEnvCache = sharedEnvSchema.parse({
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-test-key',
          NEXT_PUBLIC_MEDIA_CDN_URL: process.env.NEXT_PUBLIC_MEDIA_CDN_URL,
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
          NEXT_PUBLIC_ALLOW_PENDING_IMAGES: process.env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES,
          NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS: process.env.NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS,
        })
        return sharedEnvCache
      }

      throw new EnvValidationError(formatIssues(error))
    }

    throw error
  }
}

export function validateSharedEnv(): void {
  getSharedEnv()
}

export const env = new Proxy({} as SharedEnv, {
  get(_target, property, receiver) {
    return Reflect.get(getSharedEnv(), property, receiver)
  },
})
