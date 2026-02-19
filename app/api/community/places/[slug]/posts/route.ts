import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

interface RouteParams {
  slug: string
}

interface PlaceRow {
  id: string
  name: string
  type: 'crag' | 'gym'
  slug: string | null
  country_code: string | null
}

interface SessionPostRow {
  id: string
  author_id: string
  place_id: string
  type: 'session'
  title: string | null
  body: string
  discipline: string | null
  grade_min: string | null
  grade_max: string | null
  start_at: string
  end_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: 'Missing place slug' }, { status: 400 })
  }

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
      .select('id, name, type, slug, country_code')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const typedPlace = place as PlaceRow

    const { data: postRows, error: postError } = await supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
      .eq('place_id', typedPlace.id)
      .eq('type', 'session')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(100)

    if (postError) {
      return createErrorResponse(postError, 'Error fetching community posts')
    }

    const typedPosts = (postRows || []) as SessionPostRow[]
    const authorIds = Array.from(new Set(typedPosts.map(post => post.author_id)))
    const authorMap = new Map<string, ProfileRow>()

    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', authorIds)

      for (const profile of (profileRows || []) as ProfileRow[]) {
        authorMap.set(profile.id, profile)
      }
    }

    const posts = typedPosts.map(post => ({
      ...post,
      author: authorMap.get(post.author_id) || null,
    }))

    return NextResponse.json({ place: typedPlace, posts })
  } catch (error) {
    return createErrorResponse(error, 'Error loading community place posts')
  }
}
