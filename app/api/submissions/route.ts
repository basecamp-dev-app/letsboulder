import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse, sanitizeError } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewSubmission } from '@/lib/discord'
import { makeUniqueSlug } from '@/lib/slug'

const MAX_ROUTES_PER_DAY = 5

const VALID_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const

const VALID_ROUTE_TYPES = ['sport', 'bouldering', 'trad', 'deep-water-solo'] as const

interface NewImageSubmission {
  mode: 'new'
  imageUrl: string
  imageLat: number | null
  imageLng: number | null
  captureDate: string | null
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  cragId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface ExistingImageSubmission {
  mode: 'existing'
  imageId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface NewRouteData {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  imageNaturalWidth: number
  imageNaturalHeight: number
}

interface RoutePoint {
  x: number
  y: number
}

type SubmissionRequest = NewImageSubmission | ExistingImageSubmission

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body: SubmissionRequest = await request.json()

    if (!body.routes || body.routes.length === 0) {
      return NextResponse.json({ error: 'At least one route is required' }, { status: 400 })
    }

    if (body.routeType && !VALID_ROUTE_TYPES.includes(body.routeType)) {
      return NextResponse.json({ error: 'Invalid route type' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('deleted_at', null)
      .gte('created_at', `${today}T00:00:00`)

    if ((todayRoutes || 0) + body.routes.length > MAX_ROUTES_PER_DAY) {
      return NextResponse.json({
        error: `Daily limit exceeded. You can submit ${MAX_ROUTES_PER_DAY} routes per day. You have ${(todayRoutes || 0)} already and are trying to submit ${body.routes.length}.`
      }, { status: 429 })
    }

    for (const route of body.routes) {
      if (!route.name || !route.name.trim()) {
        return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
      }
      if (!VALID_GRADES.includes(route.grade as typeof VALID_GRADES[number])) {
        return NextResponse.json({ error: `Invalid grade: ${route.grade}` }, { status: 400 })
      }
      if (!route.points || route.points.length < 2) {
        return NextResponse.json({ error: 'Route must have at least 2 points' }, { status: 400 })
      }
    }

    let imageId: string | null = null
    let imageUrl: string = ''
    let existingCragId: string | null = null

    if (body.mode === 'new') {
      if (!body.imageUrl) {
        return NextResponse.json({ error: 'Image URL is required' }, { status: 400 })
      }
      if (!body.cragId) {
        return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
      }

      imageUrl = body.imageUrl

      const { data: image, error: imageError } = await supabase
        .from('images')
        .insert({
          url: body.imageUrl,
          latitude: body.imageLat,
          longitude: body.imageLng,
          capture_date: body.captureDate,
          crag_id: body.cragId,
          width: body.width,
          height: body.height,
          natural_width: body.naturalWidth,
          natural_height: body.naturalHeight,
          created_by: user.id
        })
        .select('id')
        .single()

      if (imageError) {
        return createErrorResponse(imageError, 'Error creating image')
      }

      imageId = image.id

      if (process.env.INTERNAL_MODERATION_SECRET) {
        fetch(new URL('/api/moderation/check', request.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_MODERATION_SECRET,
          },
          body: JSON.stringify({ imageId: image.id }),
        }).catch((err) => console.error('Failed to queue moderation:', err))
      }
    } else {
      if (!body.imageId) {
        return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
      }

      const { data: existingImage, error: imageError } = await supabase
        .from('images')
        .select('id, url, latitude, longitude, crag_id')
        .eq('id', body.imageId)
        .single()

      if (imageError || !existingImage) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 })
      }

      imageId = existingImage.id
      imageUrl = existingImage.url
      existingCragId = existingImage.crag_id
    }

    const cragId = body.mode === 'new' ? body.cragId : existingCragId

    const usedRouteSlugs = new Set<string>()
    if (cragId) {
      const { data: existingSlugs } = await supabase
        .from('climbs')
        .select('slug')
        .eq('crag_id', cragId)
        .not('slug', 'is', null)
        .limit(10000)

      for (const row of (existingSlugs || []) as Array<{ slug: string | null }>) {
        if (row.slug) usedRouteSlugs.add(row.slug)
      }
    }

    await getRegionData(supabase, imageId!)

    const climbsData = body.routes.map((route, index) => {
      const trimmedName = route.name.trim()
      const slug = cragId ? makeUniqueSlug(trimmedName || `Route ${index + 1}`, usedRouteSlugs) : null
      return {
        name: trimmedName || `Route ${index + 1}`,
        slug,
        grade: route.grade,
        description: route.description?.trim() || null,
        route_type: body.routeType || 'sport',
        status: 'approved' as const,
        user_id: user.id,
        crag_id: cragId
      }
    })

    const { data: climbs, error: climbsError } = await supabase
      .from('climbs')
      .insert(climbsData)
      .select('id, name, grade')

    if (climbsError) {
      return createErrorResponse(climbsError, 'Error creating climbs')
    }

    if (!climbs || climbs.length === 0) {
      return NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })
    }

    for (const [index, climb] of climbs.entries()) {
      const { error: voteError } = await supabase.rpc('initialize_climb_grade_vote', {
        p_climb_id: climb.id,
        p_user_id: user.id,
        p_grade: body.routes[index].grade
      })

      if (voteError) {
        return createErrorResponse(voteError, 'Error creating grade vote')
      }
    }

    const routeLinesData = climbs.map((climb, index) => ({
      image_id: imageId!,
      climb_id: climb.id,
      points: body.routes[index].points,
      color: 'red',
      sequence_order: body.routes[index].sequenceOrder,
      image_width: body.routes[index].imageWidth,
      image_height: body.routes[index].imageHeight
    }))

    const { error: routeLinesError } = await supabase
      .from('route_lines')
      .insert(routeLinesData)

    if (routeLinesError) {
      return createErrorResponse(routeLinesError, 'Error creating route_lines')
    }

    if (cragId) {
      await updateCragBoundary(supabase, cragId)

      const { data: cragData } = await supabase
        .from('crags')
        .select('name')
        .eq('id', cragId)
        .single()

      const cragName = cragData?.name || 'Unknown Crag'

      await notifyNewSubmission(supabase, climbs, cragName, cragId, user.id).catch(err => {
        console.error('Discord notification error:', err)
      })
    }

    return NextResponse.json({
      success: true,
      climbsCreated: climbs.length,
      routeLinesCreated: routeLinesData.length,
      imageId: imageId || undefined
    })
  } catch (error) {
    return createErrorResponse(error, 'Submission error')
  }
}

async function getRegionData(supabase: ReturnType<typeof createServerClient>, imageId: string) {
  try {
    const { data } = await supabase
      .from('images')
      .select(`
        crags:crag_id (
          regions:region_id (
            name
          )
        )
      `)
      .eq('id', imageId)
      .single()

    if (data?.crags?.regions) {
      return data.crags.regions.name
    }
    return ''
  } catch {
    return ''
  }
}

async function updateCragBoundary(supabase: ReturnType<typeof createServerClient>, cragId: string) {
  try {
    const { data: routeData } = await supabase
      .rpc('compute_crag_boundary', { crag_id: cragId })

    if (routeData) {
      await supabase
        .from('crags')
        .update({ boundary: routeData })
        .eq('id', cragId)
    }
  } catch (error) {
    sanitizeError(error, 'Failed to update crag boundary')
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Submission endpoint',
    method: 'POST',
    required_fields: {
      common: ['routes (array with name, grade, points, sequenceOrder)'],
      new_image_mode: ['mode: "new_image"', 'imageUrl', 'imageLat', 'imageLng', 'cragId'],
      existing_image_mode: ['mode: "existing_image"', 'imageId']
    },
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
