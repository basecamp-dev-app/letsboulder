import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewFlag } from '@/lib/discord'

const VALID_FLAG_TYPES = ['boundary', 'access', 'description', 'rock_type', 'name', 'other']
const MAX_COMMENT_LENGTH = 250

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: cragId } = await params

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
      return NextResponse.json({ error: 'Admin access required to flag crags' }, { status: 403 })
    }

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { flag_type, comment } = body

    if (!flag_type || !VALID_FLAG_TYPES.includes(flag_type)) {
      return NextResponse.json({
        error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`
      }, { status: 400 })
    }

    const trimmedComment = comment?.trim() || ''
    if (trimmedComment.length < 10) {
      return NextResponse.json({ error: 'Comment must be at least 10 characters' }, { status: 400 })
    }

    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json({ error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` }, { status: 400 })
    }

    const { data: crag, error: cragError } = await supabase
      .from('crags')
      .select('id, name')
      .eq('id', cragId)
      .single()

    if (cragError || !crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const { data: existingFlag, error: checkError } = await supabase
      .from('climb_flags')
      .select('id, status')
      .eq('crag_id', cragId)
      .eq('flagger_id', user.id)
      .eq('status', 'pending')
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      return createErrorResponse(checkError, 'Error checking existing flag')
    }

    if (existingFlag) {
      return NextResponse.json({ error: 'You have already flagged this crag. It is being reviewed.' }, { status: 400 })
    }

    const { data: flag, error: flagError } = await supabase
      .from('climb_flags')
      .insert({
        crag_id: cragId,
        climb_id: null,
        image_id: null,
        flagger_id: user.id,
        flag_type,
        comment: trimmedComment,
        status: 'pending',
      })
      .select()
      .single()

    if (flagError) {
      return createErrorResponse(flagError, 'Error creating flag')
    }

    notifyNewFlag(supabase, {
      type: 'crag',
      flagType: flag_type,
      cragName: crag.name,
      cragId: crag.id,
      comment: trimmedComment,
      flaggerId: user.id,
    }).catch(err => console.error('Discord notification error:', err))

    return NextResponse.json({
      success: true,
      flag: {
        id: flag.id,
        flag_type,
        comment: trimmedComment,
        status: 'pending',
      },
      message: 'Flag submitted successfully. An admin will review it soon.'
    })
  } catch (error) {
    console.error('Crag flag error:', error)
    return createErrorResponse(error, 'Crag flag error')
  }
}
