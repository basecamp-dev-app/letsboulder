import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const MAX_ROUTES_PER_DAY = 5

const VALID_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const

interface NewImageSubmission {
  mode: 'new'
  imageUrl: string
  imageLat: number | null
  imageLng: number | null
  captureDate: string | null
  width: number
  height: number
  cragId: string
  routes: NewRouteData[]
}

interface ExistingImageSubmission {
  mode: 'existing'
  imageId: string
  routes: NewRouteData[]
}

interface NewRouteData {
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
}

interface RoutePoint {
  x: number
  y: number
}

type SubmissionRequest = NewImageSubmission | ExistingImageSubmission

export async function POST(request: NextRequest) {
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
    let imageLat: number | null = null
    let imageLng: number | null = null

    if (body.mode === 'new') {
      if (!body.imageUrl) {
        return NextResponse.json({ error: 'Image URL is required' }, { status: 400 })
      }
      if (body.imageLat === null || body.imageLng === null) {
        return NextResponse.json({ error: 'GPS coordinates are required for new images' }, { status: 400 })
      }
      if (!body.cragId) {
        return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
      }

      imageLat = body.imageLat
      imageLng = body.imageLng
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
          created_by: user.id
        })
        .select('id')
        .single()

      if (imageError) {
        console.error('Error creating image:', imageError)
        return NextResponse.json({ error: 'Failed to create image' }, { status: 500 })
      }

      imageId = image.id
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
      imageLat = existingImage.latitude
      imageLng = existingImage.longitude
    }

    const regionData = await getRegionData(supabase, imageId!)

    const climbsData = body.routes.map(route => ({
      name: route.name.trim(),
      grade: route.grade,
      description: route.description?.trim() || null,
      route_type: 'sport',
      status: 'pending' as const,
      user_id: user.id
    }))

    const { data: climbs, error: climbsError } = await supabase
      .from('climbs')
      .insert(climbsData)
      .select('id, name, grade')

    if (climbsError) {
      console.error('Error creating climbs:', climbsError)
      return NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })
    }

    if (!climbs || climbs.length === 0) {
      return NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })
    }

    const routeLinesData = climbs.map((climb, index) => ({
      image_id: imageId!,
      climb_id: climb.id,
      points: body.routes[index].points,
      color: 'red',
      sequence_order: body.routes[index].sequenceOrder
    }))

    const { error: routeLinesError } = await supabase
      .from('route_lines')
      .insert(routeLinesData)

    if (routeLinesError) {
      console.error('Error creating route_lines:', routeLinesError)
      return NextResponse.json({ error: 'Failed to create route lines' }, { status: 500 })
    }

    await triggerImageDiscordNotification({
      imageId: imageId!,
      imageUrl,
      latitude: imageLat!,
      longitude: imageLng!,
      region: regionData,
      submittedBy: user.email?.split('@')[0] || 'Anonymous',
      submittedByEmail: user.email || '',
      routes: climbs.map((climb, index) => ({
        id: climb.id,
        name: climb.name,
        grade: climb.grade,
        description: body.routes[index].description?.trim() || null
      }))
    })

    return NextResponse.json({
      success: true,
      climbsCreated: climbs.length,
      routeLinesCreated: routeLinesData.length,
      imageId: imageId || undefined
    })
  } catch (error) {
    console.error('Submission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

interface ImageDiscordSubmission {
  imageId: string
  imageUrl: string
  latitude: number
  longitude: number
  region: string
  submittedBy: string
  submittedByEmail: string
  routes: {
    id: string
    name: string | null
    grade: string
    description: string | null
  }[]
}

async function triggerImageDiscordNotification(submission: ImageDiscordSubmission) {
  try {
    const workerUrl = process.env.WORKER_URL || 'https://email-moderation-production.patrickhadow.workers.dev'
    const workerApiKey = process.env.WORKER_API_KEY

    await fetch(`${workerUrl}/images/discord-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerApiKey}`
      },
      body: JSON.stringify(submission)
    })
  } catch (error) {
    console.error('Failed to trigger Discord notification:', error)
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
