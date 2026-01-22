import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: imageId } = await params

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
    }

    const { data: existingFlag, error: flagError } = await supabase
      .from('climb_flags')
      .select('id, status, created_at')
      .eq('image_id', imageId)
      .eq('flagger_id', user.id)
      .eq('status', 'pending')
      .single()

    if (flagError && flagError.code !== 'PGRST116') {
      return createErrorResponse(flagError, 'Error checking flag status')
    }

    const { count: pendingCount, error: countError } = await supabase
      .from('climb_flags')
      .select('id', { count: 'exact' })
      .eq('image_id', imageId)
      .eq('status', 'pending')

    if (countError) {
      return createErrorResponse(countError, 'Error counting flags')
    }

    return NextResponse.json({
      user_has_flagged: !!existingFlag,
      flag: existingFlag || null,
      pending_flag_count: pendingCount || 0,
    })
  } catch (error) {
    return createErrorResponse(error, 'Flag status check error')
  }
}
