import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

const VALID_CORRECTION_TYPES = ['location', 'name', 'line', 'grade']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: climbId } = await params
    const body = await request.json()
    const { correction_type, suggested_value, reason } = body

    // Validate correction type
    if (!correction_type || !VALID_CORRECTION_TYPES.includes(correction_type)) {
      return NextResponse.json(
        { error: 'Invalid correction type. Must be: location, name, line, or grade' },
        { status: 400 }
      )
    }

    if (!suggested_value || typeof suggested_value !== 'object') {
      return NextResponse.json(
        { error: 'Suggested value is required' },
        { status: 400 }
      )
    }

    // Check if climb exists
    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id, name, grade, latitude, longitude')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Get original value based on correction type
    let originalValue = null
    switch (correction_type) {
      case 'location':
        originalValue = {
          latitude: climb.latitude,
          longitude: climb.longitude
        }
        break
      case 'name':
        originalValue = { name: climb.name }
        break
      case 'grade':
        originalValue = { grade: climb.grade }
        break
      case 'line':
        // Line corrections would need to reference route_lines
        break
    }

    // Create correction
    const { data: correction, error: insertError } = await supabase
      .from('climb_corrections')
      .insert({
        climb_id: climbId,
        user_id: user.id,
        correction_type,
        original_value: originalValue,
        suggested_value: suggested_value,
        reason: reason || null,
        status: 'pending',
        approval_count: 0,
        rejection_count: 0
      })
      .select()
      .single()

    if (insertError) {
      return createErrorResponse(insertError, 'Error creating correction')
    }

    return NextResponse.json({
      success: true,
      correction: {
        id: correction.id,
        climb_id: correction.climb_id,
        correction_type: correction.correction_type,
        status: correction.status,
        approval_count: correction.approval_count,
        rejection_count: correction.rejection_count
      },
      message: 'Correction submitted. Community will review and approve/reject.'
    })
  } catch (error) {
    return createErrorResponse(error, 'Correction error')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: climbId } = await params

    // Get corrections for this climb
    const { data: corrections, error } = await supabase
      .from('climb_corrections')
      .select(`
        id,
        climb_id,
        user_id,
        correction_type,
        original_value,
        suggested_value,
        reason,
        status,
        approval_count,
        rejection_count,
        created_at,
        resolved_at
      `)
      .eq('climb_id', climbId)
      .order('created_at', { ascending: false })

    if (error) {
      return createErrorResponse(error, 'Error fetching corrections')
    }

    return NextResponse.json({
      corrections: corrections || [],
      count: corrections?.length || 0
    })
  } catch (error) {
    return createErrorResponse(error, 'Get corrections error')
  }
}
