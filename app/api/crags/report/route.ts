import { NextRequest, NextResponse } from 'next/server'

interface ReportCragRequest {
  crag_id: string
  reason: string
}

export async function POST(request: NextRequest) {
  try {
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Create the report
    const response = await fetch(
      `${supabaseUrl}/rest/v1/crag_reports`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          crag_id,
          reason,
          status: 'pending',
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error creating report:', errorText)
      return NextResponse.json(
        { error: 'Failed to submit report' },
        { status: 500 }
      )
    }

    // Increment report count on crag
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/crags?id=eq.${crag_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          report_count: 1,
        }),
      }
    )

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
