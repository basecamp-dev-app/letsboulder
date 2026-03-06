import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function PATCH(
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
    if (typeof body?.isAnonymousSubmission !== 'boolean') {
      return NextResponse.json({ error: 'isAnonymousSubmission must be a boolean' }, { status: 400 })
    }

    const { data: result, error: rpcError } = await supabase.rpc('update_own_submission_anonymity', {
      p_image_id: imageId,
      p_is_anonymous: body.isAnonymousSubmission,
    })

    if (rpcError) {
      const message = rpcError.message || ''
      if (message.includes('permission')) {
        return NextResponse.json({ error: 'Only the original submitter can edit anonymity' }, { status: 403 })
      }
      if (message.includes('Image ID is required')) {
        return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
      }
      return createErrorResponse(rpcError, 'Update submission anonymity error')
    }

    const resultObject = result && typeof result === 'object' && !Array.isArray(result)
      ? result as Record<string, unknown>
      : {}

    return NextResponse.json({
      success: true,
      submission: {
        isAnonymousSubmission: resultObject.isAnonymousSubmission === true,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submission anonymity error')
  }
}
