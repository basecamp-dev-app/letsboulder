import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'

export function getAdminClientWithAudit(reason: string) {
  console.log(`[ADMIN_CLIENT_AUDIT] ${reason} - ${new Date().toISOString()}`)

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    serverEnv.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
