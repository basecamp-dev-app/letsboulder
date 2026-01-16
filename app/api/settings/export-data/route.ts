import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
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
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [profile, climbs, images, userClimbs, gradeVotes, correctionVotes, climbCorrections, climbVerifications, adminActions, routeGrades] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('climbs').select('*').eq('user_id', user.id),
      supabase.from('images').select('*').eq('created_by', user.id),
      supabase.from('user_climbs').select('*').eq('user_id', user.id),
      supabase.from('grade_votes').select('*').eq('user_id', user.id),
      supabase.from('correction_votes').select('*').eq('user_id', user.id),
      supabase.from('climb_corrections').select('*').eq('user_id', user.id),
      supabase.from('climb_verifications').select('*').eq('user_id', user.id),
      supabase.from('admin_actions').select('*').eq('user_id', user.id),
      supabase.from('route_grades').select('*').eq('user_id', user.id),
    ])

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      profile: profile.data,
      climbs: climbs.data || [],
      images: images.data || [],
      user_climbs: userClimbs.data || [],
      grade_votes: gradeVotes.data || [],
      correction_votes: correctionVotes.data || [],
      climb_corrections: climbCorrections.data || [],
      climb_verifications: climbVerifications.data || [],
      admin_actions: adminActions.data || [],
      route_grades: routeGrades.data || [],
    }

    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="gsyrocks-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Export data error')
  }
}
