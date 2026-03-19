import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { groupSubmittedImages } from '@/lib/submissions/group-submitted-images'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface ContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  moderation_status?: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
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
      .select('id, url, created_at, submission_id, moderation_status, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags(name), route_lines(count)')
      .eq('created_by', user.id)
      .or('moderation_status.eq.approved,moderation_status.eq.pending,moderation_status.is.null')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return createErrorResponse(error, 'Logbook contributions query error')
    }

    const contributionRows = (data || []) as ContributionRow[]
    const imageIds = contributionRows.map((row) => row.id)

    let links: CragImageLinkRow[] = []
    if (imageIds.length > 0) {
      const idsCsv = imageIds.join(',')
      const { data: linksData, error: linksError } = await readClient
        .from('crag_images')
        .select('source_image_id, linked_image_id')
        .or(`linked_image_id.in.(${idsCsv}),source_image_id.in.(${idsCsv})`)

      if (linksError) {
        return createErrorResponse(linksError, 'Logbook contributions relation query error')
      }

      links = (linksData || []) as CragImageLinkRow[]
    }

    const submissions = groupSubmittedImages(contributionRows, links)

    return NextResponse.json({ submissions })
  } catch (error) {
    return createErrorResponse(error, 'Logbook contributions API error')
  }
}
