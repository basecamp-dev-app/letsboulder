import { NextRequest } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { claimDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const supabase = getServerClientFromRequest(request)

  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
  return claimDraftInvite({ supabase, request, token, userId, authError })
}
