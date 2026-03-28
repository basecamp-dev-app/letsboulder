import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface DraftRoutePayload {
  id: string
  name: string
  grade: string
  description?: string | null
  climbType: string
  points: Array<{ x: number; y: number }>
  sequenceOrder: number
  imageWidth?: number | null
  imageHeight?: number | null
}

interface DraftRouteRow {
  id: string
  draft_image_id: string
  name: string
  grade: string
  description: string | null
  climb_type: string
  points: Array<{ x: number; y: number }>
  sequence_order: number
  image_width: number | null
  image_height: number | null
  created_at: string
  updated_at: string
}

function normalizeRoutePayload(value: unknown): DraftRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: DraftRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftRoutePayload>
    if (typeof candidate.id !== 'string' || !candidate.id) return null
    if (typeof candidate.name !== 'string') return null
    if (typeof candidate.grade !== 'string') return null
    if (typeof candidate.climbType !== 'string') return null
    if (!Array.isArray(candidate.points)) return null
    if (typeof candidate.sequenceOrder !== 'number') return null

    routes.push({
      id: candidate.id,
      name: candidate.name,
      grade: candidate.grade,
      description: typeof candidate.description === 'string' ? candidate.description : null,
      climbType: candidate.climbType,
      points: candidate.points.map((point) => ({
        x: typeof point?.x === 'number' ? point.x : 0,
        y: typeof point?.y === 'number' ? point.y : 0,
      })),
      sequenceOrder: candidate.sequenceOrder,
      imageWidth: typeof candidate.imageWidth === 'number' ? candidate.imageWidth : null,
      imageHeight: typeof candidate.imageHeight === 'number' ? candidate.imageHeight : null,
    })
  }

  return routes
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      const { data: collaboratorAccess } = await supabase
        .from('submission_draft_collaborators')
        .select('draft_id')
        .eq('draft_id', id)
        .eq('user_id', userId)
        .maybeSingle()

      if (!collaboratorAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data: routes, error: routesError } = await supabase
      .from('submission_draft_routes')
      .select('id, draft_image_id, name, grade, description, climb_type, points, sequence_order, image_width, image_height, created_at, updated_at')
      .eq('draft_id', id)
      .order('draft_image_id', { ascending: true })
      .order('sequence_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (routesError) {
      return createErrorResponse(routesError, 'Failed to fetch draft routes')
    }

    return NextResponse.json({ routes: (routes || []) as DraftRouteRow[] })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch draft routes')
  }
}

export async function PUT(
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

    const body = await request.json().catch(() => null) as { draftImageId?: string; routes?: unknown } | null
    const draftImageId = typeof body?.draftImageId === 'string' ? body.draftImageId : ''
    const routes = normalizeRoutePayload(body?.routes)

    if (!draftImageId) {
      return NextResponse.json({ error: 'draftImageId is required' }, { status: 400 })
    }

    if (!routes) {
      return NextResponse.json({ error: 'routes must be an array' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('sync_submission_draft_routes', {
      p_draft_id: id,
      p_draft_image_id: draftImageId,
      p_routes: routes.map((route) => ({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climbType,
        points: route.points,
        sequenceOrder: route.sequenceOrder,
        imageWidth: route.imageWidth,
        imageHeight: route.imageHeight,
      })),
    })

    if (error) {
      return createErrorResponse(error, 'Failed to sync draft routes')
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    return createErrorResponse(error, 'Failed to sync draft routes')
  }
}
