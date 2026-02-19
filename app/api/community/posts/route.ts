import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
const ALLOWED_POST_TYPES = new Set(['session', 'update', 'conditions', 'question'])

type CommunityPostType = 'session' | 'update' | 'conditions' | 'question'

interface CreateSessionPostBody {
  type?: CommunityPostType
  place_id?: string
  title?: string | null
  body?: string
  discipline?: string | null
  grade_min?: string | null
  grade_max?: string | null
  start_at?: string
  end_at?: string | null
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const payload = await request.json() as CreateSessionPostBody
    const type = payload.type || 'session'
    const placeId = payload.place_id?.trim()
    const rawBody = payload.body?.trim() || ''
    const title = payload.title?.trim() || null
    const discipline = payload.discipline?.trim() || null
    const gradeMin = payload.grade_min?.trim() || null
    const gradeMax = payload.grade_max?.trim() || null
    const startAt = parseDate(payload.start_at)
    const endAt = parseDate(payload.end_at)

    if (!ALLOWED_POST_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid post type' }, { status: 400 })
    }

    if (!placeId) {
      return NextResponse.json({ error: 'place_id is required' }, { status: 400 })
    }

    if (type === 'session' && !startAt) {
      return NextResponse.json({ error: 'Valid start_at is required for session posts' }, { status: 400 })
    }

    if (rawBody.length < 1 || rawBody.length > 2000) {
      return NextResponse.json({ error: 'body must be between 1 and 2000 characters' }, { status: 400 })
    }

    if (title && title.length > 120) {
      return NextResponse.json({ error: 'title must be 120 characters or less' }, { status: 400 })
    }

    if (discipline && !ALLOWED_DISCIPLINES.has(discipline)) {
      return NextResponse.json({ error: 'Invalid discipline' }, { status: 400 })
    }

    if (gradeMin && gradeMin.length > 10) {
      return NextResponse.json({ error: 'grade_min must be 10 characters or less' }, { status: 400 })
    }

    if (gradeMax && gradeMax.length > 10) {
      return NextResponse.json({ error: 'grade_max must be 10 characters or less' }, { status: 400 })
    }

    if (type === 'session' && endAt && startAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })
    }

    const { data: place } = await supabase
      .from('places')
      .select('id')
      .eq('id', placeId)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        author_id: user.id,
        place_id: placeId,
        type,
        title,
        body: rawBody,
        discipline,
        grade_min: gradeMin,
        grade_max: gradeMax,
        start_at: type === 'session' ? startAt : null,
        end_at: type === 'session' ? endAt : null,
      })
      .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
      .single()

    if (error) {
      return createErrorResponse(error, 'Error creating community post')
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Error creating community post')
  }
}
