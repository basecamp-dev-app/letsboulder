import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { claimDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'
import { serverEnv } from '@/lib/env'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const cookies = request.cookies
  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
  return claimDraftInvite({ supabase, request, token, userId, authError })
}
