import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface DraftCollaboratorRow {
  draft_id: string
  user_id: string
  role: string
  created_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

function getDisplayName(profile: ProfileRow | null): string {
  if (!profile) return 'Unknown user'
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return 'Unknown user'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle()

    if (draftError) return createErrorResponse(draftError, 'Load draft collaborators error')
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    const isOwner = draft.user_id === userId
    let hasCollaboratorAccess = false
    if (!isOwner) {
      const { data: accessRow, error: accessError } = await supabase
        .from('submission_draft_collaborators')
        .select('draft_id')
        .eq('draft_id', id)
        .eq('user_id', userId)
        .maybeSingle()
      if (accessError) return createErrorResponse(accessError, 'Load draft collaborators error')
      hasCollaboratorAccess = !!accessRow
    }

    if (!isOwner && !hasCollaboratorAccess) {
      return NextResponse.json({ error: 'You do not have access to this draft' }, { status: 403 })
    }

    const { data: collaboratorRows, error: collaboratorError } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id, user_id, role, created_at')
      .eq('draft_id', id)
      .order('created_at', { ascending: true })

    if (collaboratorError) return createErrorResponse(collaboratorError, 'Load draft collaborators error')

    const collaboratorUserIds = ((collaboratorRows || []) as DraftCollaboratorRow[])
      .map((row) => row.user_id)
      .filter((rowUserId): rowUserId is string => typeof rowUserId === 'string' && !!rowUserId)

    const profileIds = Array.from(new Set([draft.user_id, ...collaboratorUserIds]))
    let profilesById = new Map<string, ProfileRow>()

    if (profileIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', profileIds)
      profilesById = new Map(((profileRows || []) as ProfileRow[]).map((profile) => [profile.id, profile]))
    }

    const ownerProfile = draft.user_id ? profilesById.get(draft.user_id) || null : null
    const collaborators = ((collaboratorRows || []) as DraftCollaboratorRow[]).map((row) => {
      const profile = profilesById.get(row.user_id) || null
      return {
        userId: row.user_id,
        role: row.role,
        createdAt: row.created_at,
        profile: {
          displayName: getDisplayName(profile),
          username: profile?.username || null,
          avatarUrl: profile?.avatar_url || null,
        },
      }
    })

    let activeInvites: Array<{
      id: string
      token: string
      maxUses: number | null
      usedCount: number
      expiresAt: string | null
      createdAt: string
    }> = []

    if (isOwner) {
      const { data: inviteRows, error: inviteError } = await supabase
        .from('submission_draft_collaborator_invites')
        .select('id, token, max_uses, used_count, expires_at, created_at')
        .eq('draft_id', id)
        .order('created_at', { ascending: false })

      if (inviteError) return createErrorResponse(inviteError, 'Load draft collaborators error')

      const nowIso = new Date().toISOString()
      activeInvites = (inviteRows || [])
        .filter((invite) => {
          if (invite.expires_at && invite.expires_at <= nowIso) return false
          if (invite.max_uses !== null && invite.used_count >= invite.max_uses) return false
          return true
        })
        .map((invite) => ({
          id: invite.id,
          token: invite.token,
          maxUses: invite.max_uses,
          usedCount: invite.used_count,
          expiresAt: invite.expires_at,
          createdAt: invite.created_at,
        }))
    }

    return NextResponse.json({
      owner: draft.user_id
        ? {
            userId: draft.user_id,
            profile: {
              displayName: getDisplayName(ownerProfile),
              username: ownerProfile?.username || null,
              avatarUrl: ownerProfile?.avatar_url || null,
            },
          }
        : null,
      collaborators,
      isOwner,
      draftStatus: draft.status,
      activeInvites,
    })
  } catch (error) {
    return createErrorResponse(error, 'Load draft collaborators error')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) return rateLimitResponse

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle()

    if (draftError) return createErrorResponse(draftError, 'Create draft invite error')
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Only the draft owner can create invites' }, { status: 403 })
    }

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be shared' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const parsedMaxUses = body?.maxUses
    const maxUses = parsedMaxUses === null || parsedMaxUses === undefined
      ? null
      : Number.isInteger(parsedMaxUses) && parsedMaxUses > 0
        ? parsedMaxUses
        : null

    const parsedExpiresAt = body?.expiresAt
    const expiresAt = typeof parsedExpiresAt === 'string' && parsedExpiresAt.trim()
      ? parsedExpiresAt
      : null

    if (expiresAt) {
      const parsed = new Date(expiresAt)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid expiresAt value' }, { status: 400 })
      }
    }

    const { data: invite, error: inviteError } = await supabase
      .from('submission_draft_collaborator_invites')
      .insert({
        draft_id: id,
        created_by: userId,
        max_uses: maxUses,
        expires_at: expiresAt,
      })
      .select('id, token, max_uses, used_count, expires_at, created_at')
      .single()

    if (inviteError || !invite) {
      return createErrorResponse(inviteError, 'Create draft invite error')
    }

    const origin = request.nextUrl.origin
    const inviteUrl = `${origin}/api/submissions/drafts/collaborate/${invite.token}`

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        maxUses: invite.max_uses,
        usedCount: invite.used_count,
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
        inviteUrl,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Create draft invite error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) return rateLimitResponse

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : ''
    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()

    if (draftError) return createErrorResponse(draftError, 'Revoke draft invite error')
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Only the draft owner can revoke invites' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('submission_draft_collaborator_invites')
      .delete()
      .eq('id', inviteId)
      .eq('draft_id', id)

    if (deleteError) return createErrorResponse(deleteError, 'Revoke draft invite error')
    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Revoke draft invite error')
  }
}
