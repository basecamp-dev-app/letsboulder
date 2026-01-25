import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface CreateCragRequest {
  name: string
  latitude?: number
  longitude?: number
  rock_type?: string
  type?: 'sport' | 'boulder' | 'trad' | 'mixed'
  description?: string
  access_notes?: string
}

interface CragWithCounts {
  id: string
  name: string
  latitude: number
  longitude: number
  rock_type: string | null
  type: string | null
  climb_count: number
  image_count: number
  created_at: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const adminMode = searchParams.get('admin') === 'true'

  if (!adminMode) {
    return NextResponse.json({ message: 'Crags endpoint', method: 'POST', rate_limit: `${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours` })
  }

  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: crags, error: cragsError } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude, rock_type, type, created_at')

    if (cragsError) {
      return createErrorResponse(cragsError, 'Error fetching crags')
    }

    const cragIds = crags?.map(c => c.id) || []

    const { data: climbCounts, error: climbError } = await supabase
      .from('climbs')
      .select('crag_id, id')
      .in('crag_id', cragIds)

    if (climbError) {
      return createErrorResponse(climbError, 'Error fetching climb counts')
    }

    const { data: imageCounts, error: imageError } = await supabase
      .from('images')
      .select('crag_id, id')
      .in('crag_id', cragIds)

    if (imageError) {
      return createErrorResponse(imageError, 'Error fetching image counts')
    }

    const climbCountMap = new Map<string, number>()
    for (const c of climbCounts || []) {
      if (c.crag_id) {
        climbCountMap.set(c.crag_id, (climbCountMap.get(c.crag_id) || 0) + 1)
      }
    }

    const imageCountMap = new Map<string, number>()
    for (const i of imageCounts || []) {
      if (i.crag_id) {
        imageCountMap.set(i.crag_id, (imageCountMap.get(i.crag_id) || 0) + 1)
      }
    }

    const cragsWithCounts: CragWithCounts[] = (crags || []).map(crag => ({
      id: crag.id,
      name: crag.name,
      latitude: crag.latitude,
      longitude: crag.longitude,
      rock_type: crag.rock_type,
      type: crag.type,
      climb_count: climbCountMap.get(crag.id) || 0,
      image_count: imageCountMap.get(crag.id) || 0,
      created_at: crag.created_at
    }))

    return NextResponse.json({ crags: cragsWithCounts })
  } catch (error) {
    return createErrorResponse(error, 'Error fetching crags')
  }
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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
    const { name, latitude, longitude, rock_type, type, description, access_notes } = body

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user?.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if ((latitude && !longitude) || (!latitude && longitude)) {
      return NextResponse.json(
        { error: 'Both latitude and longitude must be provided together, or neither' },
        { status: 400 }
      )
    }

    if (latitude && longitude) {
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
    }

    const { data: createdCrag, error: createError } = await supabase
      .from('crags')
      .insert({
        name,
        latitude: latitude || null,
        longitude: longitude || null,
        rock_type: rock_type || undefined,
        type: type || 'sport',
        description: description || undefined,
        access_notes: access_notes || undefined,
      })
      .select('id, name, latitude, longitude, rock_type, type, created_at')
      .single()

    if (createError) {
      return createErrorResponse(createError, 'Error creating crag')
    }

    return NextResponse.json(createdCrag, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Error creating crag')
  }
}
