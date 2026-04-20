import { createBrowserClient } from '@supabase/ssr'
import { getSharedEnv } from '@/lib/env'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const sharedEnv = getSharedEnv()
  const supabaseUrl = sharedEnv.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = sharedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing public Supabase environment variables')
  }

  const client = createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  )

  if (typeof window !== 'undefined') {
    browserClient = client
  }

  return client
}
