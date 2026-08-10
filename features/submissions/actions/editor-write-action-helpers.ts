import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDraftConflictResponse, resolveDisplayName, type ProfileRow } from '@/features/submissions/server/drafts/draft-route-shared'
import { revalidatePublicCrag } from '@/features/crags/public'

export async function buildDraftConflictResult(
  supabase: SupabaseClient,
  updatedAt: string,
  lastEditedBy: string | null
) {
  let lastUpdatedByDisplayName: string | null = null

  if (typeof lastEditedBy === 'string' && lastEditedBy) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', lastEditedBy)
      .maybeSingle()

    lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
  }

  const response = buildDraftConflictResponse({
    updatedAt,
    lastEditedBy,
    lastUpdatedByDisplayName,
  })

  return response.json()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function mergeDraftMetadata(
  existingMetadata: Record<string, unknown>,
  metadataPatch: Record<string, unknown>
) {
  const existingSubmission = asRecord(existingMetadata.submission)
  const patchSubmission = asRecord(metadataPatch.submission)

  return {
    ...existingMetadata,
    ...metadataPatch,
    submission: {
      ...existingSubmission,
      ...patchSubmission,
      location: {
        ...asRecord(existingSubmission.location),
        ...asRecord(patchSubmission.location),
      },
    },
  }
}

export async function revalidateSubmissionImagePaths(supabase: SupabaseClient, imageId: string) {
  revalidatePath('/')

  const { data: image } = await supabase.from('images').select('crag_id').eq('id', imageId).single()
  if (!image?.crag_id) return
  revalidatePublicCrag(image.crag_id)

  const { data: cragData } = await supabase.from('crags').select('slug, country_code').eq('id', image.crag_id).single()
  if (cragData?.slug && cragData?.country_code) {
    revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
  }
}
