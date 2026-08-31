'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getServerClient } from '@/lib/supabase-server'
import { deleteSubmission } from '@/features/submissions/server/submissions/delete-submission'
import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'
import { deleteSubmissionDraft } from '@/features/submissions/server/drafts/draft-write-service'
import { buildUploadSignature, normalizeCreateImages, validateDraftImageOwnership } from '@/features/submissions/server/drafts/draft-route-helpers'
import type { Database, Json } from '@/types/database'
import { z } from 'zod'

type SubmissionDraftInsert = Database['public']['Tables']['submission_drafts']['Insert']
type SubmissionDraftImageInsert = Database['public']['Tables']['submission_draft_images']['Insert']

interface DraftCreateInput {
  images?: unknown
  metadata?: Record<string, unknown>
  cragId?: string | null
}

interface DraftCreateResult {
  success: true
  draft: {
    id: string
    user_id: string
    crag_id: string | null
    status: string
    metadata: Json
    created_at: string
    updated_at: string
    images: Array<{ id: string; display_order: number }>
  }
}

const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonSchema),
  z.record(z.string(), jsonSchema),
]))

const draftCreateSchema = z.object({
  images: z.unknown().optional(),
  metadata: z.record(z.string(), jsonSchema).optional(),
  cragId: z.string().trim().min(1).nullable().optional(),
})

const draftIdSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID is required'),
})

const imageIdSchema = z.object({
  imageId: z.string().trim().min(1, 'Image ID is required'),
})

export async function createSubmissionDraftAction(input: DraftCreateInput): Promise<ActionResult<DraftCreateResult['draft']>> {
  const validation = validateActionInput(draftCreateSchema, input)
  if (!validation.success) return fail<DraftCreateResult['draft']>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const images = normalizeCreateImages(validation.data.images)
  if (!images) {
    return { success: false, error: 'images must be an array when provided', status: 400 }
  }

  const ownershipError = await validateDraftImageOwnership(
    supabase,
    auth.data.userId,
    images
  )

  if (ownershipError) {
    return { success: false, error: 'Failed to validate draft image ownership', status: ownershipError.status }
  }

  const uploadSignature = images.length > 0 ? buildUploadSignature(images) : null
  const metadataBase = validation.data.metadata ?? {}
  const metadata: Json = {
    ...metadataBase,
    ...(uploadSignature ? { uploadSignature } : {}),
  }

  if (uploadSignature) {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at')
      .eq('user_id', auth.data.userId)
      .eq('status', 'draft')
      .contains('metadata', { uploadSignature })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existingDraftError && existingDraft) {
      const { data: existingImages, error: existingImagesError } = await supabase
        .from('submission_draft_images')
        .select('id, display_order')
        .eq('draft_id', existingDraft.id)
        .order('display_order', { ascending: true })

      if (!existingImagesError) {
        return { success: true, data: { ...existingDraft, images: existingImages || [] } }
      }
    }
  }

  const draftInsert: SubmissionDraftInsert = {
    user_id: auth.data.userId,
    crag_id: validation.data.cragId ?? null,
    status: 'draft',
    metadata,
  }

  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .insert(draftInsert)
    .select('id, user_id, crag_id, status, metadata, created_at, updated_at')
    .single()

  if (draftError || !draft) {
    return { success: false, error: 'Failed to create submission draft', status: 500 }
  }

  const imageRows: SubmissionDraftImageInsert[] = images.map((image, index) => ({
    draft_id: draft.id,
    display_order: index,
    storage_bucket: image.uploadedBucket,
    storage_path: image.uploadedPath,
    latitude: image.gpsData?.latitude ?? null,
    longitude: image.gpsData?.longitude ?? null,
    capture_date: image.captureDate ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    route_data: {},
  }))

  if (imageRows.length === 0) {
    return { success: true, data: { ...draft, images: [] } }
  }

  const { data: createdImages, error: imagesError } = await supabase
    .from('submission_draft_images')
    .insert(imageRows)
    .select('id, display_order')
    .order('display_order', { ascending: true })

  if (imagesError) {
    return { success: false, error: 'Failed to create submission draft images', status: 500 }
  }

  return { success: true, data: { ...draft, images: createdImages || [] } }
}

export async function deleteSubmissionDraftAction(draftId: string): Promise<ActionResult> {
  const validation = validateActionInput(draftIdSchema, { draftId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const result = await deleteSubmissionDraft({ supabase: await getServerClient(), draftId: validation.data.draftId, cleanupAuditReason: 'cleanup draft storage objects' })
  if (result.kind === 'success') return { success: true }
  if (result.kind === 'not_found') return { success: false, error: 'Draft not found', status: 404 }
  if (result.kind === 'forbidden') return { success: false, error: 'Forbidden', status: 403 }
  if (result.kind === 'not_editable') return { success: false, error: 'Only draft submissions can be deleted', status: 409 }
  if (result.kind === 'conflict') return { success: false, error: 'The draft changed while it was being deleted', status: 409 }
  return { success: false, error: 'Failed to delete submission draft', status: 500 }
}

export async function publishSubmissionDraftAction(draftId: string): Promise<ActionResult<{ publication?: { state: 'public' | 'pending_crag_review'; cragId: string | null }; published?: { imageId?: string; imageIds?: string[]; routeLineIds?: string[] }; cragId?: string | null }>> {
  const validation = validateActionInput(draftIdSchema, { draftId })
  if (!validation.success) return fail<{ published?: { imageId?: string; imageIds?: string[]; routeLineIds?: string[] }; cragId?: string | null }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const supabase = await getServerClient()
  const result = await promoteDraftToSubmission({ supabase, draftId: validation.data.draftId, userId: auth.data.userId })
  if (result.kind === 'failure') {
    return { success: false, error: typeof result.payload.error === 'string' ? result.payload.error : 'Failed to publish draft', status: result.status }
  }
  const { published } = result.value
  const { data: image } = published.imageId
    ? await supabase.from('images').select('crag_id').eq('id', published.imageId).maybeSingle()
    : { data: null }
  return { success: true, data: { publication: result.value.publication, published, cragId: image?.crag_id ?? null } }
}

export async function deletePublishedSubmissionAction(imageId: string): Promise<ActionResult<{ cragId: string | null }>> {
  const validation = validateActionInput(imageIdSchema, { imageId })
  if (!validation.success) {
    return fail<{ cragId: string | null }>(
      validation.result.error || 'Invalid request data',
      validation.result.status || 400,
      validation.result.fieldErrors
    )
  }

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const supabaseAdmin = getAdminClientWithAudit('delete published submission')
  const response = await deleteSubmission({ supabase, supabaseAdmin, userId: auth.data.userId, imageId: validation.data.imageId })
  const payload = await response.json().catch(() => ({} as { error?: string; cragId?: string | null }))

  if (!response.ok) {
    return { success: false, error: payload.error || 'Delete submission error', status: response.status }
  }

  return { success: true, data: { cragId: payload.cragId ?? null } }
}
