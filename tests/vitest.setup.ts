import { beforeEach, vi } from 'vitest'

type SupabaseGetUserResponse = {
  user: { id: string } | null
  error: { message: string } | null
}

const supabaseAuthState: SupabaseGetUserResponse = {
  user: null,
  error: null,
}

function setSupabaseGetUserResponse(nextState: Partial<SupabaseGetUserResponse>) {
  supabaseAuthState.user = nextState.user ?? null
  supabaseAuthState.error = nextState.error ?? null
}

function makeQueryBuilder(result: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 }) {
  const builder: Record<string, unknown> = {}
  const returnBuilder = () => builder

  for (const methodName of ['select', 'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'not', 'in', 'or', 'order', 'limit', 'update', 'insert', 'delete']) {
    builder[methodName] = vi.fn(returnBuilder)
  }

  builder.single = vi.fn(async () => ({ data: null, error: null }))
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  builder.then = (onFulfilled?: (value: { data: unknown; error: unknown; count?: number }) => unknown, onRejected?: (reason: unknown) => unknown) => {
    return Promise.resolve(result).then(onFulfilled, onRejected)
  }
  builder.catch = (onRejected?: (reason: unknown) => unknown) => {
    return Promise.resolve(result).catch(onRejected)
  }
  builder.finally = (onFinally?: () => void) => {
    return Promise.resolve(result).finally(onFinally)
  }

  return builder
}

vi.mock('@supabase/ssr', () => {
  return {
    createServerClient: vi.fn(() => {
      return {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: supabaseAuthState.user },
            error: supabaseAuthState.error,
          })),
          getSession: vi.fn(async () => ({
            data: { session: null },
            error: null,
          })),
        },
        from: vi.fn(() => makeQueryBuilder()),
        rpc: vi.fn(async () => ({ data: null, error: null })),
        storage: {
          from: vi.fn(() => ({
            remove: vi.fn(async () => ({ data: null, error: null })),
            createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
          })),
        },
      }
    }),
  }
})

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-test-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-test-key-that-is-at-least-32-chars-long'
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret-test-key-that-is-at-least-32-chars'
process.env.DELETE_ACCOUNT_SECRET = process.env.DELETE_ACCOUNT_SECRET || 'delete-account-secret-test-key-32chars'
process.env.R2_S3_ENDPOINT = process.env.R2_S3_ENDPOINT || 'https://test.r2.cloudflarestorage.com'
process.env.R2_PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET || 'test-private'
process.env.R2_PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET || 'test-public'
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key'
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret-key'

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
})

declare global {
  var __setSupabaseGetUserResponse: (nextState: Partial<SupabaseGetUserResponse>) => void
}

globalThis.__setSupabaseGetUserResponse = setSupabaseGetUserResponse

beforeEach(() => {
  vi.clearAllMocks()
  setSupabaseGetUserResponse({ user: null, error: null })
})

export {}
