import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { VALID_GRADES } from '@/lib/submission-types'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface GradeVotePayloadItem {
  routeLineId: string
  grade: string
}

function normalizePayload(value: unknown): GradeVotePayloadItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalized: GradeVotePayloadItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const routeLineId = typeof (item as { routeLineId?: unknown }).routeLineId === 'string'
      ? (item as { routeLineId: string }).routeLineId
      : ''
    const grade = typeof (item as { grade?: unknown }).grade === 'string'
      ? (item as { grade: string }).grade
      : ''

    if (!routeLineId || !VALID_GRADES.includes(grade as (typeof VALID_GRADES)[number])) {
      return null
    }

    normalized.push({ routeLineId, grade })
  }

  return normalized
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

  const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY,
        { cookies: { getAll() { return [] }, setAll() {} } }
      )
    : null

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
    const grades = normalizePayload(body?.grades)
    if (!grades) {
      return NextResponse.json({ error: 'A valid grades array is required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, created_by')
      .eq('id', imageId)
      .maybeSingle()

    if (imageError) {
      return createErrorResponse(imageError, 'Save submission grade votes error')
    }

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const ownerId = typeof image.created_by === 'string' ? image.created_by : null
    if (!ownerId) {
      return NextResponse.json({ error: 'This submission is not editable' }, { status: 403 })
    }

    let hasAccess = ownerId === userId
    if (!hasAccess) {
      const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_collaborators')
        .select('image_id')
        .eq('image_id', imageId)
        .eq('user_id', userId)
        .maybeSingle()

      if (collaboratorError) {
        return createErrorResponse(collaboratorError, 'Save submission grade votes error')
      }

      hasAccess = !!collaboratorAccess
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Only the owner or a collaborator can set grade votes' }, { status: 403 })
    }

    const uniqueRouteLineIds = Array.from(new Set(grades.map((item) => item.routeLineId)))
    const { data: routeLines, error: routeLinesError } = await supabase
      .from('route_lines')
      .select('id, climb_id')
      .eq('image_id', imageId)
      .in('id', uniqueRouteLineIds)

    if (routeLinesError) {
      return createErrorResponse(routeLinesError, 'Save submission grade votes error')
    }

    const climbIdByRouteLineId = new Map(
      (routeLines || []).map((routeLine) => [routeLine.id, routeLine.climb_id])
    )

    if (climbIdByRouteLineId.size !== uniqueRouteLineIds.length) {
      return NextResponse.json({ error: 'One or more routes are invalid for this submission' }, { status: 400 })
    }

    const { data: collaboratorRows, error: collaboratorsError } = await supabase
      .from('submission_collaborators')
      .select('user_id')
      .eq('image_id', imageId)

    if (collaboratorsError) {
      return createErrorResponse(collaboratorsError, 'Save submission grade votes error')
    }

    const voterUserIds = Array.from(new Set([
      ownerId,
      ...((collaboratorRows || [])
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === 'string' && !!id)),
    ]))

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service role key missing' }, { status: 500 })
    }

    const voteRows = grades.flatMap((item) => {
      const climbId = climbIdByRouteLineId.get(item.routeLineId)
      if (!climbId) return []
      return voterUserIds.map((voterUserId) => ({
        climb_id: climbId,
        user_id: voterUserId,
        grade: item.grade,
      }))
    })

    if (voteRows.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('grade_votes')
        .upsert(voteRows, { onConflict: 'climb_id,user_id' })

      if (upsertError) {
        return createErrorResponse(upsertError, 'Save submission grade votes error')
      }
    }

    return NextResponse.json({
      success: true,
      votesUpdated: voteRows.length,
      collaboratorCount: voterUserIds.length,
    })
  } catch (error) {
    return createErrorResponse(error, 'Save submission grade votes error')
  }
}
