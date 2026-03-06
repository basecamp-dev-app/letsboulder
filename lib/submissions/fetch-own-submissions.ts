import type { SupabaseClient } from '@supabase/supabase-js'
import { getSignedUrlBatchKey, type SignedUrlBatchResponse } from '@/lib/signed-url-batch'
import type { DraftImageRef, Submission } from '@/types/submissions'

interface DraftSubmissionRow {
  id: string
  created_at: string
  updated_at: string
  crags: { name?: string } | Array<{ name?: string }> | null
  submission_draft_images: DraftImageRef[] | null
}

interface SignedUrlObject {
  bucket: string
  path: string
}

export async function fetchOwnSubmissions(
  supabase: SupabaseClient,
  userId: string,
  signedFetch: typeof fetch,
  limit = 24
): Promise<Submission[]> {
  const formattedSubmissions: Submission[] = []

  const submissionsResponse = await fetch(`/api/logbook/contributions?limit=${limit}`)
  if (submissionsResponse.ok) {
    const payload = await submissionsResponse.json().catch(() => ({ submissions: [] as Submission[] }))
    if (Array.isArray(payload.submissions)) {
      for (const submission of payload.submissions) {
        if (!submission || typeof submission !== 'object') continue
        const candidate = submission as Submission
        formattedSubmissions.push({
          ...candidate,
          status: candidate.status === 'published' || candidate.status === 'pending_review'
            ? candidate.status
            : 'pending_review',
        })
      }
    }
  }

  const { data: draftSubmissions } = await supabase
    .from('submission_drafts')
    .select('id, created_at, updated_at, crags(name), submission_draft_images(storage_bucket, storage_path, route_data)')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(limit)

  const draftRows = (draftSubmissions || []) as DraftSubmissionRow[]
  const firstDraftImageObjects = draftRows
    .map((draft) => {
      const draftImages = draft.submission_draft_images || []
      const firstImage = draftImages[0]
      if (!firstImage?.storage_bucket || !firstImage?.storage_path) return null
      return {
        bucket: firstImage.storage_bucket,
        path: firstImage.storage_path,
      }
    })
    .filter((item): item is SignedUrlObject => !!item)

  const signedByKey = new Map<string, string>()
  if (firstDraftImageObjects.length > 0) {
    const signedUrlResponse = await signedFetch('/api/uploads/signed-urls/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: firstDraftImageObjects }),
    })

    if (signedUrlResponse.ok) {
      const signedData = await signedUrlResponse.json().catch(() => ({} as SignedUrlBatchResponse))
      for (const item of signedData.results || []) {
        if (!item?.signedUrl) continue
        signedByKey.set(getSignedUrlBatchKey(item.bucket, item.path), item.signedUrl)
      }
    }
  }

  const formattedDrafts: Submission[] = draftRows.map((draft) => {
    const cragRelation = draft.crags
    const cragName = Array.isArray(cragRelation)
      ? (cragRelation[0]?.name || null)
      : (cragRelation?.name || null)

    const draftImages = draft.submission_draft_images || []
    const firstImage = draftImages[0]
    const previewUrl = firstImage?.storage_bucket && firstImage?.storage_path
      ? (signedByKey.get(getSignedUrlBatchKey(firstImage.storage_bucket, firstImage.storage_path)) || '')
      : ''

    const routeCount = draftImages.reduce((count, image) => {
      const routeData = image.route_data
      if (routeData && typeof routeData === 'object' && 'completedRoutes' in (routeData as Record<string, unknown>)) {
        const completedRoutes = (routeData as { completedRoutes?: unknown[] }).completedRoutes
        return count + (Array.isArray(completedRoutes) ? completedRoutes.length : 0)
      }
      return count
    }, 0)

    return {
      id: draft.id,
      kind: 'draft',
      status: 'draft',
      is_anonymous_submission: false,
      url: previewUrl,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      crag_name: cragName,
      route_lines_count: routeCount,
      contribution_credit_platform: null,
      contribution_credit_handle: null,
    }
  })

  return [...formattedDrafts, ...formattedSubmissions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}
