import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface CollaboratorRow {
  image_id: string
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

async function resolveImageOwnerId(
  supabase: ReturnType<typeof createServerClient>,
  imageId: string
): Promise<{ ownerId: string | null; exists: boolean; error: unknown }> {
  const { data, error } = await supabase
    .from('images')
    .select('id, created_by')
    .eq('id', imageId)
    .maybeSingle()

  if (error) return { ownerId: null, exists: false, error }
  if (!data) return { ownerId: null, exists: false, error: null }

  return {
    ownerId: typeof data.created_by === 'string' ? data.created_by : null,
    exists: true,
    error: null,
  }
}

async function userCanAccessCollaborators(
  supabase: ReturnType<typeof createServerClient>,
  imageId: string,
  userId: string,
  ownerId: string | null
): Promise<boolean> {
  if (ownerId && ownerId === userId) return true

  const { data, error } = await supabase
    .from('submission_collaborators')
    .select('image_id')
    .eq('image_id', imageId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return false
  return !!data
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
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

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const { ownerId, exists, error: ownerError } = await resolveImageOwnerId(supabase, imageId)
    if (ownerError) {
      return createErrorResponse(ownerError, 'Load collaborators error')
    }

    if (!exists) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const canAccess = await userCanAccessCollaborators(supabase, imageId, userId, ownerId)
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this submission' }, { status: 403 })
    }

    const { data: collaboratorRows, error: collaboratorError } = await supabase
      .from('submission_collaborators')
      .select('image_id, user_id, role, created_at')
      .eq('image_id', imageId)
      .order('created_at', { ascending: true })

    if (collaboratorError) {
      return createErrorResponse(collaboratorError, 'Load collaborators error')
    }

    const collaboratorUserIds = ((collaboratorRows || []) as CollaboratorRow[])
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === 'string' && !!id)

    const profileIds = ownerId
      ? Array.from(new Set([ownerId, ...collaboratorUserIds]))
      : Array.from(new Set(collaboratorUserIds))

    let profilesById = new Map<string, ProfileRow>()
    if (profileIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', profileIds)

      profilesById = new Map(
        ((profileRows || []) as ProfileRow[]).map((profile) => [profile.id, profile])
      )
    }

    const ownerProfile = ownerId ? profilesById.get(ownerId) || null : null

    const collaborators = ((collaboratorRows || []) as CollaboratorRow[]).map((row) => {
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

    const isOwner = ownerId === userId
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
        .from('submission_collaborator_invites')
        .select('id, token, max_uses, used_count, expires_at, created_at')
        .eq('image_id', imageId)
        .order('created_at', { ascending: false })

      if (inviteError) {
        return createErrorResponse(inviteError, 'Load collaborators error')
      }

      const nowIso = new Date().toISOString()
      activeInvites = ((inviteRows || []) as Array<{
        id: string
        token: string
        max_uses: number | null
        used_count: number
        expires_at: string | null
        created_at: string
      }>)
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
      owner: ownerId
        ? {
            userId: ownerId,
            profile: {
              displayName: getDisplayName(ownerProfile),
              username: ownerProfile?.username || null,
              avatarUrl: ownerProfile?.avatar_url || null,
            },
          }
        : null,
      collaborators,
      isOwner,
      activeInvites,
    })
  } catch (error) {
    return createErrorResponse(error, 'Load collaborators error')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
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
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const { ownerId, exists, error: ownerError } = await resolveImageOwnerId(supabase, imageId)
    if (ownerError) {
      return createErrorResponse(ownerError, 'Create collaborator invite error')
    }

    if (!exists) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: 'Only the submission owner can create invites' }, { status: 403 })
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
      .from('submission_collaborator_invites')
      .insert({
        image_id: imageId,
        created_by: userId,
        max_uses: maxUses,
        expires_at: expiresAt,
      })
      .select('id, token, max_uses, used_count, expires_at, created_at')
      .single()

    if (inviteError || !invite) {
      return createErrorResponse(inviteError, 'Create collaborator invite error')
    }

    const origin = request.nextUrl.origin
    const inviteUrl = `${origin}/api/submissions/collaborate/${invite.token}`

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
    return createErrorResponse(error, 'Create collaborator invite error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
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
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : ''
    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 })
    }

    const { ownerId, exists, error: ownerError } = await resolveImageOwnerId(supabase, imageId)
    if (ownerError) {
      return createErrorResponse(ownerError, 'Revoke collaborator invite error')
    }

    if (!exists) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: 'Only the submission owner can revoke invites' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('submission_collaborator_invites')
      .delete()
      .eq('id', inviteId)
      .eq('image_id', imageId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Revoke collaborator invite error')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Revoke collaborator invite error')
  }
}
