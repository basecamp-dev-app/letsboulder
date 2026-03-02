import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function POST(request: NextRequest) {
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
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const body = await request.json()
    const { climbIds, style = 'top' } = body

    if (!climbIds || !Array.isArray(climbIds) || climbIds.length === 0) {
      return NextResponse.json({ error: 'climbIds array is required' }, { status: 400 })
    }

    const validStyles = ['flash', 'top', 'try']
    if (!validStyles.includes(style)) {
      return NextResponse.json({ error: 'Invalid style' }, { status: 400 })
    }

    const logs = climbIds.map(climbId => ({
      user_id: userId,
      climb_id: climbId,
      style,
      date_climbed: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('user_climbs')
      .upsert(logs, { onConflict: 'user_id,climb_id' })

    if (error) {
      return createErrorResponse(error, 'Failed to log climbs')
    }

    return NextResponse.json({
      success: true,
      logged: climbIds.length,
      style
    })

  } catch (error) {
    return createErrorResponse(error, 'Log routes error')
  }
}
