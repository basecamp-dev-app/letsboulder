import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewFlag } from '@/lib/discord'

const DEFAULT_FLAG_TYPE = 'other'
const DEFAULT_COMMENT = 'Flagged for admin review'

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

    const { error: flagError } = await supabase
      .from('climb_flags')
      .insert({
        crag_id: cragId,
        climb_id: null,
        image_id: null,
        flagger_id: user.id,
        flag_type: DEFAULT_FLAG_TYPE,
        comment: DEFAULT_COMMENT,
        status: 'pending',
      })
      .select()
      .single()

    if (flagError) {
      return createErrorResponse(flagError, 'Error creating flag')
    }

    await notifyNewFlag(supabase, {
      type: 'crag',
      flagType: DEFAULT_FLAG_TYPE,
      cragName: crag.name,
      cragId: crag.id,
      comment: DEFAULT_COMMENT,
      flaggerId: user.id,
    }).catch(err => console.error('Discord notification error:', err))

    return NextResponse.json({
      success: true,
      message: 'Crag flagged for review'
    })
  } catch (error) {
    console.error('Crag flag error:', error)
    return createErrorResponse(error, 'Crag flag error')
  }
}
