import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface ClaimDraftInviteResult {
  draft_id?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const tokenValue = typeof token === 'string' ? token.trim() : ''

  if (!tokenValue) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
  if (authError || !userId) {
    const returnTo = `/api/submissions/drafts/collaborate/${encodeURIComponent(tokenValue)}`
    const authUrl = new URL(`/auth?redirect_to=${encodeURIComponent(returnTo)}`, request.url)
    return NextResponse.redirect(authUrl)
  }

  const { data, error } = await supabase.rpc('claim_submission_draft_collaborator_invite', {
    p_token: tokenValue,
  })

  if (error || !data) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  const claim = data as ClaimDraftInviteResult
  if (!claim.draft_id) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  const redirectUrl = new URL(`/logbook/drafts/${claim.draft_id}/edit?collab=added`, request.url)
  return NextResponse.redirect(redirectUrl)
}
