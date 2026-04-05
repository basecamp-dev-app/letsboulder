import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env-client'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const supabaseUrl = clientEnv.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
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
