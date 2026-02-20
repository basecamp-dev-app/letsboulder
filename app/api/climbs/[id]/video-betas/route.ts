import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { withCsrfProtection } from '@/lib/csrf-server'
import { validateAndNormalizeVideoUrl } from '@/lib/video-beta'

const MAX_TITLE_LENGTH = 120
const MAX_NOTES_LENGTH = 400
const MAX_RESULTS = 300

interface VideoBetaRow {
  id: string
  climb_id: string
  user_id: string
  url: string
  platform: string
  title: string | null
  notes: string | null
  uploader_gender: string | null
  uploader_height_cm: number | null
  uploader_reach_cm: number | null
  created_at: string
}

function getSupabase(request: NextRequest) {
  const cookies = request.cookies

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )
}

function toNullableTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase(request)

  try {
    const { id: climbId } = await params

    const { data: authResult } = await supabase.auth.getUser()
    const currentUserId = authResult.user?.id || null

    const { data, error } = await supabase
      .from('climb_video_betas')
      .select('id, climb_id, user_id, url, platform, title, notes, uploader_gender, uploader_height_cm, uploader_reach_cm, created_at')
      .eq('climb_id', climbId)
      .order('created_at', { ascending: false })
      .limit(MAX_RESULTS)

    if (error) {
      return createErrorResponse(error, 'Video betas GET error')
    }

    const items = ((data as VideoBetaRow[] | null) || []).map((item) => ({
      ...item,
      is_owner: currentUserId ? item.user_id === currentUserId : false,
    }))

    return NextResponse.json({
      climb_id: climbId,
      video_betas: items,
    })
  } catch (error) {
    return createErrorResponse(error, 'Video betas GET error')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getSupabase(request)

  try {
    const { data: authResult, error: authError } = await supabase.auth.getUser()
    const user = authResult.user

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: climbId } = await params
    const body = await request.json()

    const videoUrl = typeof body?.url === 'string' ? body.url : ''
    const title = toNullableTrimmedString(body?.title, MAX_TITLE_LENGTH)
    const notes = toNullableTrimmedString(body?.notes, MAX_NOTES_LENGTH)

    const validation = validateAndNormalizeVideoUrl(videoUrl)
    if (!validation.valid || !validation.url || !validation.platform) {
      return NextResponse.json({ error: validation.error || 'Invalid URL' }, { status: 400 })
    }

    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json({ error: 'Climb not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('gender, height_cm, reach_cm')
      .eq('id', user.id)
      .maybeSingle()

    const { data: inserted, error: insertError } = await supabase
      .from('climb_video_betas')
      .insert({
        climb_id: climbId,
        user_id: user.id,
        url: validation.url,
        platform: validation.platform,
        title,
        notes,
        uploader_gender: profile?.gender || null,
        uploader_height_cm: typeof profile?.height_cm === 'number' ? profile.height_cm : null,
        uploader_reach_cm: typeof profile?.reach_cm === 'number' ? profile.reach_cm : null,
      })
      .select('id, climb_id, user_id, url, platform, title, notes, uploader_gender, uploader_height_cm, uploader_reach_cm, created_at')
      .single()

    if (insertError || !inserted) {
      if (insertError?.code === '23505') {
        return NextResponse.json({ error: 'You already shared this exact link for this route' }, { status: 409 })
      }
      return createErrorResponse(insertError, 'Video betas POST error')
    }

    return NextResponse.json({
      success: true,
      video_beta: {
        ...(inserted as VideoBetaRow),
        is_owner: true,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Video betas POST error')
  }
}
