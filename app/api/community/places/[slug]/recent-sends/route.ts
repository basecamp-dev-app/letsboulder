import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

interface RouteParams {
  slug: string
}

interface RecentSendRow {
  user_id: string
  style: 'top' | 'flash' | 'onsight'
  created_at: string
  climb_id: string
  star_rating: number | null
  climbs: {
    id: string
    name: string
    grade: string
    place_id: string | null
    crag_id: string | null
  } | Array<{
    id: string
    name: string
    grade: string
    place_id: string | null
    crag_id: string | null
  }>
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_public: boolean
}

function getDisplayName(profile: ProfileRow): string {
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  if (fullName) return fullName
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return `Climber ${profile.id.slice(0, 4)}`
}

function getClimbRecord(
  climbs: RecentSendRow['climbs']
): { id: string; name: string; grade: string; place_id: string | null; crag_id: string | null } | null {
  if (Array.isArray(climbs)) return climbs[0] || null
  return climbs || null
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: 'Missing place slug' }, { status: 400 })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

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
    const { data: place } = await supabase
      .from('places')
      .select('id, name, slug')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const placeId = place.id

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const [byPlaceResult, byLegacyCragResult] = await Promise.all([
      supabase
        .from('user_climbs')
        .select('user_id, style, created_at, climb_id, star_rating, climbs!inner(id, name, grade, place_id, crag_id)')
        .in('style', ['top', 'flash', 'onsight'])
        .gte('created_at', sixtyDaysAgo)
        .eq('climbs.place_id', placeId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('user_climbs')
        .select('user_id, style, created_at, climb_id, star_rating, climbs!inner(id, name, grade, place_id, crag_id)')
        .in('style', ['top', 'flash', 'onsight'])
        .gte('created_at', sixtyDaysAgo)
        .eq('climbs.crag_id', placeId)
        .is('climbs.place_id', null)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

    if (byPlaceResult.error) {
      return createErrorResponse(byPlaceResult.error, 'Place recent sends query error')
    }
    if (byLegacyCragResult.error) {
      return createErrorResponse(byLegacyCragResult.error, 'Place recent sends query error')
    }

    const deduped = new Map<string, RecentSendRow>()
    for (const row of [
      ...((byPlaceResult.data as unknown as RecentSendRow[] | null) || []),
      ...((byLegacyCragResult.data as unknown as RecentSendRow[] | null) || []),
    ]) {
      deduped.set(`${row.user_id}:${row.climb_id}:${row.created_at}:${row.style}`, row)
    }

    const recentSends = Array.from(deduped.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const userIds = Array.from(new Set(recentSends.map((row) => row.user_id)))

    if (userIds.length === 0) {
      return NextResponse.json(
        {
          place: { id: place.id, name: place.name, slug: place.slug },
          recent_sends: [],
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, first_name, last_name, avatar_url, is_public')
      .eq('is_public', true)
      .in('id', userIds)

    if (profilesError) {
      return createErrorResponse(profilesError, 'Place recent sends profiles error')
    }

    const profileMap = new Map(((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile]))

    const responseRows = recentSends
      .map((row) => {
        const profile = profileMap.get(row.user_id)
        if (!profile) return null

        const climb = getClimbRecord(row.climbs)
        if (!climb) return null

        return {
          user_id: row.user_id,
          style: row.style,
          created_at: row.created_at,
          profile: {
            id: profile.id,
            display_name: getDisplayName(profile),
            avatar_url: profile.avatar_url,
          },
          climb: {
            id: climb.id,
            name: climb.name,
            grade: climb.grade,
          },
          rating: typeof row.star_rating === 'number' ? row.star_rating : null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, limit)

    return NextResponse.json(
      {
        place: { id: place.id, name: place.name, slug: place.slug },
        recent_sends: responseRows,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Place recent sends error')
  }
}
