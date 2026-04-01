import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createErrorResponse } from '@/lib/errors'
import { serverEnv } from '@/lib/env'

interface ReorderFacesPayload {
  imageIds: string[]
}

function normalizePayload(value: unknown): ReorderFacesPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { imageIds?: unknown }
  if (!Array.isArray(candidate.imageIds)) return null
  const imageIds = candidate.imageIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (imageIds.length !== candidate.imageIds.length || imageIds.length === 0) return null
  return { imageIds }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('submission_id, crag_id')
      .eq('id', imageId)
      .maybeSingle()

    if (imageError) {
      return createErrorResponse(imageError, 'Reorder submission faces error')
    }

    if (!image?.submission_id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const { data: result, error: reorderError } = await supabase.rpc('update_submission_image_order', {
      p_submission_id: image.submission_id,
      p_image_ids: payload.imageIds,
    })

    if (reorderError) {
      const message = (reorderError.message || '').toLowerCase()
      if (message.includes('permission')) {
        return NextResponse.json({ error: 'You do not have permission to edit this submission' }, { status: 403 })
      }
      return createErrorResponse(reorderError, 'Reorder submission faces error')
    }

    revalidatePath('/')
    if (image.crag_id) {
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
      updatedCount: typeof result === 'number' ? result : payload.imageIds.length,
    })
  } catch (error) {
    return createErrorResponse(error, 'Reorder submission faces error')
  }
}
