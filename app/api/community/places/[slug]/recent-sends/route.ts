import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { loadPlaceUserClimbs, enrichPlaceClimbsWithProfiles } from '@/features/community/server/load-place-climb-data'

interface RouteParams {
  slug: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: 'Missing place slug' }, { status: 400 })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  const supabase = getServerClientFromRequest(request)

  try {
    const { data: place } = await supabase
      .from('places')
      .select('id, name, slug')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const climbs = await loadPlaceUserClimbs(supabase, place.id, { windowStart: sixtyDaysAgo })

    if (climbs.length === 0) {
      return NextResponse.json(
        {
          place: { id: place.id, name: place.name, slug: place.slug },
          recent_sends: [],
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      )
    }

    const enriched = await enrichPlaceClimbsWithProfiles(supabase, climbs)

    const responseRows = enriched
      .slice(0, limit)
      .map((row) => ({
        user_id: row.user_id,
        style: row.style,
        created_at: row.created_at,
        profile: row.profile,
        climb: row.climb,
        rating: typeof row.star_rating === 'number' ? row.star_rating : null,
      }))

    return NextResponse.json(
      {
        place: { id: place.id, name: place.name, slug: place.slug },
        recent_sends: responseRows,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Place recent sends error')
  }
}
