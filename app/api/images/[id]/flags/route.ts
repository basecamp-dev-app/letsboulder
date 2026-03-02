import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: imageId } = await params

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
    }

    const { data: existingFlag, error: flagError } = await supabase
      .from('climb_flags')
      .select('id, status, created_at')
      .eq('image_id', imageId)
      .eq('flagger_id', userId)
      .eq('status', 'pending')
      .single()

    if (flagError && flagError.code !== 'PGRST116') {
      return createErrorResponse(flagError, 'Error checking flag status')
    }

    const { count: pendingCount, error: countError } = await supabase
      .from('climb_flags')
      .select('id', { count: 'exact' })
      .eq('image_id', imageId)
      .eq('status', 'pending')

    if (countError) {
      return createErrorResponse(countError, 'Error counting flags')
    }

    const response = NextResponse.json({
      user_has_flagged: !!existingFlag,
      flag: existingFlag || null,
      pending_flag_count: pendingCount || 0,
    })

    response.headers.set('Cache-Control', 'private, max-age=60')
    return response
  } catch (error) {
    return createErrorResponse(error, 'Flag status check error')
  }
}
