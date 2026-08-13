import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { groupSubmittedImages } from '@/features/submissions/lib/group-submitted-images'

interface ContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  moderation_status?: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string; slug?: string | null; country_code?: string | null } | Array<{ name?: string; slug?: string | null; country_code?: string | null }> | null
  route_lines: Array<{ count?: number }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const limitParam = Number(new URL(request.url).searchParams.get('limit') || 200)
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(Math.trunc(limitParam), 500))
      : 200

    const { data, error } = await supabase
      .from('images')
      .select('id, url, created_at, submission_id, moderation_status, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags!images_crag_id_fkey(name, slug, country_code), route_lines(count)')
      .eq('created_by', user.id)
      .or('moderation_status.eq.approved,moderation_status.eq.skipped,moderation_status.eq.pending,moderation_status.is.null')
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
      const { data: linksData, error: linksError } = await supabase
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
