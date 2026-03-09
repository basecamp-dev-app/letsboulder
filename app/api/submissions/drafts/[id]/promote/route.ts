import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export const runtime = 'nodejs'

const INTERNAL_MODERATION_SECRET = process.env.INTERNAL_MODERATION_SECRET

interface PromoteResult {
  success?: boolean
  status?: string
  image_id?: string
  image_ids?: string[]
  climb_ids?: string[]
  route_line_ids?: string[]
  published_at?: string
}

interface DatabaseErrorLike {
  message?: string
  details?: string
  hint?: string
  code?: string
}

function isPermissionDeniedError(error: DatabaseErrorLike | null | undefined): boolean {
  if (!error) return false

  if (error.code === '42501') return true

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('violates row-level security policy')
  )
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
      typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
      !(latitude === 0 && longitude === 0)

    if (!hasValidLocation) {
      return NextResponse.json({ error: 'Add climb location before publishing this draft' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('promote_draft_to_submission', {
      p_draft_id: id,
    })

    if (error) {
      if (typeof error.message === 'string' && error.message.includes('Draft location is required before publishing')) {
        return NextResponse.json({ error: 'Add climb location before publishing this draft' }, { status: 400 })
      }

      if (typeof error.message === 'string' && error.message.includes('Primary face directions are required before publishing')) {
        return NextResponse.json({ error: 'Select a face direction for each face before publishing this draft' }, { status: 400 })
      }

      if (typeof error.message === 'string' && error.message.includes('Primary draft image must contain at least one route before publishing')) {
        return NextResponse.json({ error: 'Draw at least one route on the primary face before publishing this draft' }, { status: 400 })
      }

      if (isPermissionDeniedError(error)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return createErrorResponse(error, 'Failed to publish draft')
    }

    const result = (Array.isArray(data) ? data[0] : data) as PromoteResult | null
    if (!result?.success || !result.image_id) {
      return NextResponse.json({ error: 'Failed to publish draft' }, { status: 500 })
    }

    if (INTERNAL_MODERATION_SECRET) {
      const csrfToken = request.headers.get('x-csrf-token')
      const cookieHeader = request.headers.get('cookie')
      const moderationHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'x-internal-secret': INTERNAL_MODERATION_SECRET,
      }

      if (csrfToken) {
        moderationHeaders['x-csrf-token'] = csrfToken
      }

      if (cookieHeader) {
        moderationHeaders.cookie = cookieHeader
      }

      fetch(new URL('/api/moderation/check', request.url), {
        method: 'POST',
        headers: moderationHeaders,
        body: JSON.stringify({ imageId: result.image_id }),
      })
        .then(async (res) => {
          if (res.ok) return
          const text = await res.text().catch(() => '')
          console.error('Failed to queue moderation for published draft:', {
            draftId: id,
            imageId: result.image_id,
            status: res.status,
            body: text.slice(0, 500),
          })
        })
        .catch((queueError) => console.error('Failed to queue moderation for published draft:', {
          draftId: id,
          imageId: result.image_id,
          error: queueError,
        }))
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
