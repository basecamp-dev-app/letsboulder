import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const cookies = request.cookies

  const rateLimitResult = rateLimit(request, 'publicSearch')
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

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
    const { searchParams } = new URL(request.url)
    const cragId = searchParams.get('crag_id')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeRoutes = searchParams.get('include_routes') === 'true'
    const imageId = searchParams.get('image_id')

    if (!cragId && !imageId) {
      return NextResponse.json(
        { error: 'crag_id or image_id is required' },
        { status: 400 }
      )
    }

    if (imageId) {
      const { data: image, error } = await supabase
        .from('images')
        .select(`
          id,
          url,
          moderation_status,
          latitude,
          longitude,
          capture_date,
          width,
          height,
          created_at,
          route_lines (
            id,
            climb_id,
            points,
            sequence_order,
            created_at,
            climbs!inner (
              id,
              name,
              grade,
              status
            )
          )
        `)
        .eq('id', imageId)
        .eq('moderation_status', 'approved')
        .single()

      if (error) {
        return createErrorResponse(error, 'Error fetching image')
      }

      const routeLines = includeRoutes && image.route_lines
        ? image.route_lines.map((rl: Record<string, unknown>) => ({
            id: (rl as { id: string }).id,
            image_id: image.id,
            climb_id: (rl as { climb_id: string }).climb_id,
            points: (rl as { points: unknown }).points,
            sequence_order: (rl as { sequence_order: number }).sequence_order,
            created_at: (rl as { created_at: string }).created_at,
            climb: (rl as { climbs: { id: string; name: string | null; grade: string; status: string } }).climbs
          }))
        : undefined

      return NextResponse.json({
        id: image.id,
        url: image.url,
        latitude: image.latitude,
        longitude: image.longitude,
        capture_date: image.capture_date,
        width: image.width,
        height: image.height,
        created_at: image.created_at,
        route_lines: routeLines
      })
    }

    const { data, error } = await supabase
      .from('images')
      .select(`
        id,
        url,
        moderation_status,
        latitude,
        longitude,
        capture_date,
        width,
        height,
        created_at,
        route_lines(count)
      `)
      .eq('crag_id', cragId)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return createErrorResponse(error, 'Error fetching images')
    }

    const formatted = (data || []).map((img: Record<string, unknown>) => ({
      id: img.id,
      url: img.url,
      latitude: img.latitude,
      longitude: img.longitude,
      capture_date: img.capture_date,
      width: img.width,
      height: img.height,
      created_at: img.created_at,
      route_lines_count: Array.isArray(img.route_lines) && img.route_lines[0] ? (img.route_lines[0] as { count: number }).count : 0
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    return createErrorResponse(error, 'Images search API error')
  }
}
