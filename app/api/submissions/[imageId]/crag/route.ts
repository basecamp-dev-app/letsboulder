import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { revalidatePath } from 'next/cache'

interface UpdateSubmissionCragPayload {
  cragName: string
  regionTag: string
  subArea?: string | null
}

function normalizePayload(value: unknown): UpdateSubmissionCragPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    cragName?: unknown
    regionTag?: unknown
    subArea?: unknown
  }

  if (typeof candidate.cragName !== 'string') return null
  if (typeof candidate.regionTag !== 'string') return null
  if (candidate.subArea !== undefined && candidate.subArea !== null && typeof candidate.subArea !== 'string') return null

  const cragName = candidate.cragName.trim()
  const regionTag = candidate.regionTag.trim()
  const subArea = typeof candidate.subArea === 'string' ? candidate.subArea.trim() : null

  if (!cragName || !regionTag) return null

  return {
    cragName,
    regionTag,
    subArea: subArea || null,
  }
}

export async function PUT(
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
    const payload = normalizePayload(body)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { data: result, error: rpcError } = await supabase.rpc('update_submission_crag_metadata', {
      p_image_id: imageId,
      p_crag_name: payload.cragName,
      p_region_tag: payload.regionTag,
      p_sub_area: payload.subArea,
    })

    if (rpcError) {
      const message = (rpcError.message || '').toLowerCase()
      if (message.includes('owner') || message.includes('permission')) {
        return NextResponse.json({ error: 'Only the submission owner can edit crag metadata' }, { status: 403 })
      }
      if (message.includes('not found') || message.includes('required')) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 })
      }
      return createErrorResponse(rpcError, 'Update submission crag metadata error')
    }

    const { data: image } = await supabase
      .from('images')
      .select('crag_id')
      .eq('id', imageId)
      .single()

    revalidatePath('/')

    if (image?.crag_id) {
      const { data: cragData } = await supabase
        .from('crags')
        .select('slug, country_code')
        .eq('id', image.crag_id)
        .single()

      if (cragData?.slug && cragData?.country_code) {
        revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
      }
    }

    return NextResponse.json({
      success: true,
      crag: result,
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submission crag metadata error')
  }
}
