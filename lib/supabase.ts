import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env-client'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const client = createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
