import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { isValidGrade } from '@/lib/grade-constants'

const MAX_ROUTES_PER_DAY = 5

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const body = await request.json()
    const { name, grade, imageUrl, latitude, longitude, cragsId } = body

    if (!name || !grade || !imageUrl || !latitude || !longitude || !cragsId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof grade !== 'string' || !isValidGrade(grade)) {
      return NextResponse.json({ error: 'Invalid grade' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('deleted_at', null)
      .gte('created_at', `${today}T00:00:00`)

    if ((todayRoutes || 0) >= MAX_ROUTES_PER_DAY) {
      return NextResponse.json({
        error: `Daily limit reached. You can submit ${MAX_ROUTES_PER_DAY} routes per day.`
      }, { status: 429 })
    }

    const routeId = crypto.randomUUID()

    const { error: insertError } = await supabase
      .from('climbs')
      .insert({
        id: routeId,
        name,
        grade,
        crags_id: cragsId,
        latitude,
        longitude,
        image_url: imageUrl,
        user_id: userId,
        status: 'pending',
        created_at: new Date().toISOString()
      })

    if (insertError) {
      return createErrorResponse(insertError, 'Route insert error')
    }

    return NextResponse.json({
      success: true,
      routeId,
      message: 'Route submitted for review. You will receive an email when it is approved.'
    })
  } catch (error) {
    return createErrorResponse(error, 'Route submission error')
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Route submission endpoint',
    method: 'POST',
    required_fields: ['name', 'grade', 'imageUrl', 'latitude', 'longitude', 'cragsId'],
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
