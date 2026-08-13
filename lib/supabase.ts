import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientEnv } from '@/lib/env-client'
import type { Database } from '@/types/database'

let browserClient: SupabaseClient<Database> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const supabaseUrl = clientEnv.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing public Supabase environment variables')
  }

  const client = createBrowserClient<Database>(
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
