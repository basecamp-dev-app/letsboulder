import type { SupabaseClient } from '@supabase/supabase-js'
import { groupSubmittedImages } from './group-submitted-images'
import { selectPreferredDraftPreviewImage, type DraftPreviewImageRef } from '@/features/submissions/lib/draft-preview'
import type { DraftImageRef, Submission } from '@/types/submissions'

interface DraftSubmissionRow {
  id: string
  created_at: string
  updated_at: string
  crags: { name?: string } | Array<{ name?: string }> | null
  submission_draft_images: DraftImageRef[] | null
  submission_draft_routes: Array<{ id: string }> | null
}

interface ImageContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  moderation_status: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string; slug?: string | null; country_code?: string | null } | Array<{ name?: string; slug?: string | null; country_code?: string | null }> | null
  route_lines: Array<{ id: string; climb_id: string }> | null
}

export async function fetchOwnSubmissions(
  supabase: SupabaseClient,
  userId: string,
  _signedFetch: typeof fetch,
  limit = 24
): Promise<Submission[]> {
  const dedupeSubmissions = (items: Submission[]): Submission[] => {
    const byKey = new Map<string, Submission>()
    for (const item of items) {
      const key = item.kind === 'submitted'
        ? `submitted:${item.canonical_image_id || item.id}`
        : `draft:${item.id}`
      const existing = byKey.get(key)
      if (!existing || new Date(item.updated_at).getTime() >= new Date(existing.updated_at).getTime()) {
        byKey.set(key, item)
      }
    }
    return [...byKey.values()]
  }

  const { data: contributionRows } = await supabase
    .from('images')
    .select('id, url, created_at, submission_id, moderation_status, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags(name, slug, country_code), route_lines(id, climb_id)')
    .eq('created_by', userId)
    .or('moderation_status.eq.approved,moderation_status.eq.pending,moderation_status.is.null')
    .order('created_at', { ascending: false })
    .limit(200)

  const publishedSubmissions: Submission[] = contributionRows
    ? groupSubmittedImages(contributionRows as ImageContributionRow[], [])
      .filter((submission) => submission.route_lines_count > 0)
    : []

  const { data: draftSubmissions } = await supabase
    .from('submission_drafts')
    .select('id, created_at, updated_at, crags(name), submission_draft_images(storage_bucket, storage_path, route_data, display_order, processing_status), submission_draft_routes(id)')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(limit)

  const draftRows = (draftSubmissions || []) as DraftSubmissionRow[]

  const formattedDrafts: Submission[] = draftRows.map((draft) => {
    const cragRelation = draft.crags
    const cragName = Array.isArray(cragRelation)
      ? (cragRelation[0]?.name || null)
      : (cragRelation?.name || null)

    const draftImages = (draft.submission_draft_images || []) as DraftPreviewImageRef[]
    const preferredImage = selectPreferredDraftPreviewImage(draftImages)

    const routeCountFromRows = Array.isArray(draft.submission_draft_routes) ? draft.submission_draft_routes.length : 0
    const routeCountFromLegacy = draftImages.reduce((count, image) => {
      const routeData = image.route_data
      if (routeData && typeof routeData === 'object' && 'completedRoutes' in (routeData as Record<string, unknown>)) {
        const completedRoutes = (routeData as { completedRoutes?: unknown[] }).completedRoutes
        return count + (Array.isArray(completedRoutes) ? completedRoutes.length : 0)
      }
      return count
    }, 0)
    const routeCount = routeCountFromRows > 0 ? routeCountFromRows : routeCountFromLegacy

    return {
      id: draft.id,
      canonical_image_id: null,
      kind: 'draft',
      status: 'draft',
      is_anonymous_submission: false,
      url: '',
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      crag_name: cragName,
      route_lines_count: routeCount,
      image_count: draftImages.length,
      contribution_credit_platform: null,
      contribution_credit_handle: null,
      draft_preview_bucket: preferredImage?.storage_bucket || null,
      draft_preview_path: preferredImage?.storage_path || null,
    }
  })

  return dedupeSubmissions([...formattedDrafts, ...publishedSubmissions])
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}
