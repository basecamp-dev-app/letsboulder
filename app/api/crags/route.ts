import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

interface CreateCragRequest {
  name: string
  latitude: number
  longitude: number
  region_id?: string
  region_name?: string
  rock_type?: string
  type?: 'sport' | 'boulder' | 'trad' | 'mixed'
  description?: string
  access_notes?: string
}

export async function GET() {
  return NextResponse.json({ message: 'Crags endpoint', method: 'POST', rate_limit: `${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours` })
}

export async function POST(request: NextRequest) {
  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body: CreateCragRequest = await request.json()
    const { name, latitude, longitude, region_id, region_name, rock_type, type, description, access_notes } = body

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user?.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    if (!name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Name, latitude, and longitude are required' },
        { status: 400 }
      )
    }

    let resolvedRegionId = region_id

    if (!resolvedRegionId && region_name) {
      const { data: regions } = await supabase
        .from('regions')
        .select('id, name')
        .ilike('name', region_name)
        .limit(1)

      if (regions && regions.length > 0) {
        resolvedRegionId = regions[0].id
      } else {
        const { data: newRegion, error: regionError } = await supabase
          .from('regions')
          .insert({ name: region_name })
          .select('id')
          .single()

        if (!regionError && newRegion) {
          resolvedRegionId = newRegion.id
        }
      }
    }

    const { data: existingCrags } = await supabase
      .from('crags')
      .select('id, name')
      .eq('latitude', latitude)
      .eq('longitude', longitude)
      .limit(1)

    if (existingCrags && existingCrags.length > 0) {
      return NextResponse.json(
        {
          error: `A crag already exists at these coordinates: "${existingCrags[0].name}"`,
          existingCragId: existingCrags[0].id,
          existingCragName: existingCrags[0].name,
          code: 'DUPLICATE'
        },
        { status: 409 }
      )
    }

    const { data: createdCrag, error: createError } = await supabase
      .from('crags')
      .insert({
        name,
        latitude,
        longitude,
        region_id: resolvedRegionId || undefined,
        rock_type: rock_type || undefined,
        type: type || 'sport',
        description: description || undefined,
        access_notes: access_notes || undefined,
      })
      .select('id, name, latitude, longitude, region_id, rock_type, type, created_at')
      .single()

    if (createError) {
      return createErrorResponse(createError, 'Error creating crag')
    }

    return NextResponse.json(createdCrag, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Error creating crag')
  }
}
