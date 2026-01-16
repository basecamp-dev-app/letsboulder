import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface ReportCragRequest {
  crag_id: string
  reason: string
}

export async function POST(request: NextRequest) {
  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body: ReportCragRequest = await request.json()
    const { crag_id, reason } = body

    if (!crag_id || !reason) {
      return NextResponse.json(
        { error: 'Crag ID and reason are required' },
        { status: 400 }
      )
    }

    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'Please provide more detail about why you are reporting this crag' },
        { status: 400 }
      )
    }

    const { error: reportError } = await supabase
      .from('crag_reports')
      .insert({
        crag_id,
        reason,
        status: 'pending',
        reporter_id: user.id,
      })

    if (reportError) {
      console.error('Error creating report:', reportError)
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    const { error: countError } = await supabase.rpc('increment_crag_report_count', { target_crag_id: crag_id })

    if (countError) {
      console.error('Error incrementing report count:', countError)
    }

    return NextResponse.json(
      { message: 'Crag reported successfully. Our moderators will review it.' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error reporting crag:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to report crag' },
      { status: 500 }
    )
  }
}
