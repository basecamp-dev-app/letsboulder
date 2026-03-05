import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export const runtime = 'nodejs'

interface PromoteResult {
  success?: boolean
  status?: string
  image_id?: string
  image_ids?: string[]
  climb_ids?: string[]
  route_line_ids?: string[]
  published_at?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
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

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, metadata')
      .eq('id', id)
      .maybeSingle()

    if (draftError) {
      return createErrorResponse(draftError, 'Failed to validate draft before publish')
    }

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Only the draft owner can publish this draft' }, { status: 403 })
    }

    const metadata = draft.metadata && typeof draft.metadata === 'object'
      ? draft.metadata as Record<string, unknown>
      : {}
    const location = metadata.location && typeof metadata.location === 'object'
      ? metadata.location as Record<string, unknown>
      : null
    const latitude = location && typeof location.latitude === 'number' ? location.latitude : null
    const longitude = location && typeof location.longitude === 'number' ? location.longitude : null

    const hasValidLocation =
      typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180

    if (!hasValidLocation) {
      return NextResponse.json({ error: 'Set a valid location before publishing this draft' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('promote_draft_to_submission', {
      p_draft_id: id,
    })

    if (error) {
      if (typeof error.message === 'string' && error.message.includes('Draft location is required before publishing')) {
        return NextResponse.json({ error: 'Set a valid location before publishing this draft' }, { status: 400 })
      }
      return createErrorResponse(error, 'Failed to publish draft')
    }

    const result = (Array.isArray(data) ? data[0] : data) as PromoteResult | null
    if (!result?.success || !result.image_id) {
      return NextResponse.json({ error: 'Failed to publish draft' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      status: result.status || 'submitted',
      published: {
        imageId: result.image_id,
        imageIds: Array.isArray(result.image_ids) ? result.image_ids : (result.image_id ? [result.image_id] : []),
        climbIds: Array.isArray(result.climb_ids) ? result.climb_ids : [],
        routeLineIds: Array.isArray(result.route_line_ids) ? result.route_line_ids : [],
        publishedAt: result.published_at || null,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to publish draft')
  }
}
