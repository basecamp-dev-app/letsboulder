import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import type { Database } from '@/types/database'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface DraftPatchImage {
  id: string
  display_order: number
  route_data: unknown
}

interface DraftPatchBody {
  images: DraftPatchImage[]
  expected_updated_at?: string
  metadata?: Record<string, unknown>
  cragId?: string | null
}

interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name: string | null
  }
}

interface DraftPatchResult {
  draft_id: string
  updated_at: string
  updated_count: number
  images: Array<Record<string, unknown>>
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
}

type DraftImageProcessingStatus = 'pending' | 'queued' | 'processing' | 'ready' | 'failed'
type DraftImageReadinessStatus = 'processing' | 'ready' | 'error'

type DraftStorageRow = Pick<
  Database['public']['Tables']['submission_draft_images']['Row'],
  'storage_provider' | 'storage_bucket' | 'storage_path'
>

interface DraftImageRow {
  id: string
  draft_id: string
  display_order: number
  storage_bucket: string | null
  storage_path: string | null
  width: number | null
  height: number | null
  route_data: unknown
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
  processing_status: DraftImageProcessingStatus | null
  preview_variants: unknown
}

interface DraftImageResponse extends DraftImageRow {
  proxy_url: string | null
  readiness_status: DraftImageReadinessStatus
}

function buildDraftImageProxyUrl(draftId: string, path: string): string {
  const searchParams = new URLSearchParams({ draftId, path })
  return `/api/media/private?${searchParams.toString()}`
}

function resolveDisplayName(profile: ProfileRow | null): string | null {
  if (!profile) return null
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return null
}

function normalizeJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizePatchImages(value: unknown): DraftPatchImage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const images: DraftPatchImage[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftPatchImage>
    if (typeof candidate.id !== 'string' || !candidate.id) return null
    if (typeof candidate.display_order !== 'number' || !Number.isInteger(candidate.display_order) || candidate.display_order < 0) {
      return null
    }

    images.push({
      id: candidate.id,
      display_order: candidate.display_order,
      route_data: candidate.route_data ?? {},
    })
  }

  return images
}

function resolveDraftImageReadinessStatus(image: DraftImageRow): DraftImageReadinessStatus {
  if (image.storage_bucket && image.storage_path && image.processing_status === 'ready') return 'ready'
  if (!image.storage_bucket || !image.storage_path || image.processing_status === 'failed') return 'error'
  return 'processing'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

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
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at, last_edited_by, crags(name, latitude, longitude)')
      .eq('id', id)
      .maybeSingle()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const { data: images, error: imagesError } = await supabase
      .from('submission_draft_images')
      .select('id, draft_id, display_order, storage_bucket, storage_path, width, height, route_data, latitude, longitude, created_at, updated_at, processing_status, preview_variants')
      .eq('draft_id', id)
      .order('display_order', { ascending: true })

    if (imagesError) {
      return createErrorResponse(imagesError, 'Failed to fetch draft images')
    }

    const imageRows = (images || []) as DraftImageRow[]

    const withSignedUrls: DraftImageResponse[] = imageRows.map((image) => {
      return {
        ...image,
        route_data: normalizeJsonRecord(image.route_data) ?? {},
        preview_variants: normalizeJsonRecord(image.preview_variants),
        proxy_url: image.storage_path ? buildDraftImageProxyUrl(id, image.storage_path) : null,
        readiness_status: resolveDraftImageReadinessStatus(image),
      }
    })

    const isOwner = draft.user_id === userId
    return NextResponse.json({ draft: { ...draft, metadata: normalizeJsonRecord(draft.metadata), images: withSignedUrls }, isOwner })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch submission draft')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

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
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as DraftPatchBody | null
    const images = normalizePatchImages(body?.images)
    if (!images) {
      return NextResponse.json({ error: 'images must be a non-empty array of {id, display_order, route_data}' }, { status: 400 })
    }

    const expectedUpdatedAtRaw = typeof body?.expected_updated_at === 'string' ? body.expected_updated_at.trim() : ''
    const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
    if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
      return NextResponse.json({ error: 'expected_updated_at is required and must be a valid ISO timestamp' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status, updated_at, last_edited_by')
      .eq('id', id)
      .maybeSingle()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const isOwner = draft.user_id === userId
    if (!isOwner) {
      const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_draft_collaborators')
        .select('draft_id')
        .eq('draft_id', id)
        .eq('user_id', userId)
        .maybeSingle()

      if (collaboratorError || !collaboratorAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be edited' }, { status: 400 })
    }

    const expectedUpdatedAt = expectedUpdatedAtRaw
    const expectedUpdatedAtMs = expectedUpdatedAtDate.getTime()
    const currentUpdatedAtMs = new Date(draft.updated_at).getTime()
    if (!Number.isFinite(currentUpdatedAtMs) || currentUpdatedAtMs !== expectedUpdatedAtMs) {
      let lastUpdatedByDisplayName: string | null = null
      if (typeof draft.last_edited_by === 'string' && draft.last_edited_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .eq('id', draft.last_edited_by)
          .maybeSingle()
        lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
      }

      const conflictPayload: DraftConflictResponse = {
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_updated_at: draft.updated_at,
        current_data: {
          updated_at: draft.updated_at,
          last_updated_by: draft.last_edited_by,
          last_updated_by_display_name: lastUpdatedByDisplayName,
        },
      }
      return NextResponse.json(conflictPayload, { status: 409 })
    }

    const { data: patchResultRaw, error: patchError } = await supabase.rpc('patch_submission_draft_images_atomic', {
      p_draft_id: id,
      p_images: images,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (patchError) {
      if (patchError.message === 'Draft conflict') {
        const { data: currentDraft } = await supabase
          .from('submission_drafts')
          .select('updated_at, last_edited_by')
          .eq('id', id)
          .maybeSingle()

        let lastUpdatedByDisplayName: string | null = null
        if (typeof currentDraft?.last_edited_by === 'string' && currentDraft.last_edited_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, display_name')
            .eq('id', currentDraft.last_edited_by)
            .maybeSingle()
          lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
        }

        const fallbackUpdatedAt = currentDraft?.updated_at || expectedUpdatedAt
        const conflictPayload: DraftConflictResponse = {
          code: 'draft_conflict',
          message: 'This draft was updated by another collaborator. Reload to continue editing.',
          current_updated_at: fallbackUpdatedAt,
          current_data: {
            updated_at: fallbackUpdatedAt,
            last_updated_by: currentDraft?.last_edited_by || null,
            last_updated_by_display_name: lastUpdatedByDisplayName,
          },
        }
        return NextResponse.json(conflictPayload, { status: 409 })
      }
      return createErrorResponse(patchError, 'Failed to patch submission draft')
    }

    const patchResult = (patchResultRaw || null) as DraftPatchResult | null

    const metadataPatch = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : null
    const nextCragId = typeof body?.cragId === 'string'
      ? body.cragId
      : body?.cragId === null
        ? null
        : undefined

    if (metadataPatch || nextCragId !== undefined) {
      const { data: existingDraft, error: existingDraftError } = await supabase
        .from('submission_drafts')
        .select('metadata')
        .eq('id', id)
        .single()

      if (existingDraftError) {
        return createErrorResponse(existingDraftError, 'Failed to read submission draft metadata')
      }

      const existingMetadata = existingDraft?.metadata && typeof existingDraft.metadata === 'object' && !Array.isArray(existingDraft.metadata)
        ? existingDraft.metadata as Record<string, unknown>
        : {}

      const nextMetadata = metadataPatch
        ? { ...existingMetadata, ...metadataPatch }
        : existingMetadata

      const updatePayload: { metadata?: Record<string, unknown>; crag_id?: string | null; updated_at: string; last_edited_by: string } = {
        updated_at: new Date().toISOString(),
        last_edited_by: userId,
      }
      if (metadataPatch) {
        updatePayload.metadata = nextMetadata
      }
      if (nextCragId !== undefined) {
        updatePayload.crag_id = nextCragId
      }

      const { data: updatedDraft, error: updateDraftError } = await supabase
        .from('submission_drafts')
        .update(updatePayload)
        .eq('id', id)
        .eq('status', 'draft')
        .select('updated_at')
        .maybeSingle()

      if (updateDraftError) {
        return createErrorResponse(updateDraftError, 'Failed to update submission draft metadata')
      }

      return NextResponse.json({
        success: true,
        draft: {
          ...(patchResult || {}),
          updated_at: updatedDraft?.updated_at || patchResult?.updated_at || updatePayload.updated_at,
        },
      })
    }

    return NextResponse.json({ success: true, draft: patchResult })
  } catch (error) {
    return createErrorResponse(error, 'Failed to patch submission draft')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

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

  const storageClient = SUPABASE_SERVICE_ROLE_KEY
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          cookies: {
            getAll() { return [] },
            setAll() {},
          },
        }
      )
    : supabase

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be deleted' }, { status: 400 })
    }

    const { data: draftImages, error: draftImagesError } = await supabase
      .from('submission_draft_images')
      .select('storage_provider, storage_bucket, storage_path')
      .eq('draft_id', id)

    if (draftImagesError) {
      return createErrorResponse(draftImagesError, 'Failed to read draft image storage paths')
    }

    const draftStorageRows = (draftImages || []) as DraftStorageRow[]

    const { data: deletedDraft, error: deleteError } = await supabase
      .from('submission_drafts')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (deleteError) {
      return createErrorResponse(deleteError, 'Failed to delete submission draft')
    }

    if (!deletedDraft) {
      return NextResponse.json({ error: 'Failed to delete submission draft' }, { status: 500 })
    }

    await cleanupDraftStorageObjects(storageClient, draftStorageRows)

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete submission draft')
  }
}
