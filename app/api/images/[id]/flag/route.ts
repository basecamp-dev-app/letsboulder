import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

const VALID_FLAG_TYPES = ['location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other']
const MAX_COMMENT_LENGTH = 250

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: imageId } = await params

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

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
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

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, crag_id')
      .eq('id', imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const { data: existingFlag, error: checkError } = await supabase
      .from('climb_flags')
      .select('id, status')
      .eq('image_id', imageId)
      .eq('flagger_id', user.id)
      .eq('status', 'pending')
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      return createErrorResponse(checkError, 'Error checking existing flag')
    }

    if (existingFlag) {
      return NextResponse.json({ error: 'You have already flagged this image. It is being reviewed.' }, { status: 400 })
    }

    const { data: flag, error: flagError } = await supabase
      .from('climb_flags')
      .insert({
        image_id: imageId,
        crag_id: image.crag_id,
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
    return createErrorResponse(error, 'Flag error')
  }
}
