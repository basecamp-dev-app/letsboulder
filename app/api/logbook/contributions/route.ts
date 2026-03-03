import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface ContributionRow {
  id: string
  url: string
  created_at: string
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number }> | null
}

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const limitParam = Number(new URL(request.url).searchParams.get('limit') || 24)
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(Math.trunc(limitParam), 100))
      : 24

    const readClient = SUPABASE_SERVICE_ROLE_KEY
      ? createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY,
          { cookies: { getAll() { return [] }, setAll() {} } }
        )
      : supabase

    const { data, error } = await readClient
      .from('images')
      .select('id, url, created_at, contribution_credit_platform, contribution_credit_handle, crags(name), route_lines(count), moderation_status')
      .eq('created_by', user.id)
      .or('moderation_status.eq.approved,moderation_status.eq.pending,moderation_status.is.null')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return createErrorResponse(error, 'Logbook contributions query error')
    }

    const submissions = ((data || []) as ContributionRow[])
      .map((submission) => {
        const cragRelation = submission.crags
        const cragName = Array.isArray(cragRelation)
          ? (cragRelation[0]?.name || null)
          : (cragRelation?.name || null)

        const routeLines = submission.route_lines
        const routeLinesCount = Array.isArray(routeLines) && routeLines[0]
          ? (routeLines[0].count || 0)
          : 0

        return {
          id: submission.id,
          kind: 'submitted' as const,
          url: submission.url,
          created_at: submission.created_at,
          updated_at: submission.created_at,
          crag_name: cragName,
          route_lines_count: routeLinesCount,
          contribution_credit_platform: submission.contribution_credit_platform || null,
          contribution_credit_handle: submission.contribution_credit_handle || null,
        }
      })
      .filter((submission) => submission.route_lines_count > 0)

    return NextResponse.json({ submissions })
  } catch (error) {
    return createErrorResponse(error, 'Logbook contributions API error')
  }
}
