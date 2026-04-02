import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface ClaimInviteResult {
  image_id?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const tokenValue = typeof token === 'string' ? token.trim() : ''

  if (!tokenValue) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-collab-invite', request.url))
  }

  const supabase = getServerClientFromRequest(request)

  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

  if (authError || !userId) {
    const returnTo = `/api/submissions/collaborate/${encodeURIComponent(tokenValue)}`
    const authUrl = new URL(`/auth?redirect_to=${encodeURIComponent(returnTo)}`, request.url)
    return NextResponse.redirect(authUrl)
  }

  const { data, error } = await supabase.rpc('claim_submission_collaborator_invite', {
    p_token: tokenValue,
  })

  if (error || !data) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-collab-invite', request.url))
  }

  const claim = data as ClaimInviteResult
  if (!claim.image_id) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-collab-invite', request.url))
  }

  const redirectUrl = new URL(`/logbook/submissions/${claim.image_id}/edit?collab=added`, request.url)
  return NextResponse.redirect(redirectUrl)
}
