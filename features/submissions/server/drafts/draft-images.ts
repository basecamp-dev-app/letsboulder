import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import { parseWithSchema } from '@/lib/api-validation'
import {
  buildDraftConflictResponse,
  isPermissionDeniedError,
  resolveDisplayName,
  type ProfileRow,
} from '@/features/submissions/server/drafts/draft-route-shared'

interface DraftAppendImageInput {
  storage_bucket: string
  storage_path: string
  gps_data?: {
    latitude: number
    longitude: number
  } | null
  capture_date?: string | null
  width?: number | null
  height?: number | null
  route_data?: Record<string, unknown>
}

const draftAppendImageSchema = z.object({
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
  gps_data: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable().optional(),
  capture_date: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  route_data: z.record(z.string(), z.unknown()).optional(),
})

const appendDraftImagesSchema = z.object({
  images: z.array(draftAppendImageSchema).min(1, 'images must be a non-empty array'),
  expected_updated_at: z.string().min(1, 'expected_updated_at is required and must be a valid ISO timestamp'),
})

export function normalizeAppendDraftImages(value: unknown): DraftAppendImageInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalized: DraftAppendImageInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftAppendImageInput>
    if (typeof candidate.storage_bucket !== 'string' || !candidate.storage_bucket) return null
    if (typeof candidate.storage_path !== 'string' || !candidate.storage_path) return null

    normalized.push({
      storage_bucket: candidate.storage_bucket,
      storage_path: candidate.storage_path,
      gps_data: candidate.gps_data && typeof candidate.gps_data === 'object' && typeof candidate.gps_data.latitude === 'number' && typeof candidate.gps_data.longitude === 'number'
        ? {
            latitude: candidate.gps_data.latitude,
            longitude: candidate.gps_data.longitude,
          }
        : null,
      capture_date: typeof candidate.capture_date === 'string' && candidate.capture_date ? candidate.capture_date : null,
      width: typeof candidate.width === 'number' ? candidate.width : null,
      height: typeof candidate.height === 'number' ? candidate.height : null,
      route_data: candidate.route_data && typeof candidate.route_data === 'object' && !Array.isArray(candidate.route_data)
        ? candidate.route_data
        : {},
    })
  }

  return normalized
}

export async function appendDraftImages(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  userId: string
  draftId: string
  requestBody: unknown
}) {
  const { supabase, userId, draftId, requestBody } = input
  const ownershipClient = supabase as unknown as Parameters<typeof userOwnsUploadedObject>[0]
  const parsedBody = parseWithSchema(appendDraftImagesSchema, requestBody)
  if (!parsedBody.success) return parsedBody.response

  const body = parsedBody.data
  const images = normalizeAppendDraftImages(body.images)
  if (!images) {
    return NextResponse.json({ error: 'images must be a non-empty array' }, { status: 400 })
  }

  const expectedUpdatedAtRaw = body.expected_updated_at
  const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
  if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
    return NextResponse.json({ error: 'expected_updated_at is required and must be a valid ISO timestamp' }, { status: 400 })
  }

  for (const image of images) {
    if (!(await userOwnsUploadedObject(ownershipClient, userId, image.storage_bucket, image.storage_path))) {
      return NextResponse.json({ error: 'Invalid uploaded path owner' }, { status: 403 })
    }
  }

  const expectedUpdatedAt = expectedUpdatedAtDate.toISOString()
  const { data: appendResultRaw, error: appendError } = await supabase.rpc('append_submission_draft_images_atomic', {
    p_draft_id: draftId,
    p_images: images,
    p_expected_updated_at: expectedUpdatedAt,
  })

  if (appendError) {
    if (appendError.message === 'Draft conflict') {
      const { data: currentDraft } = await supabase
        .from('submission_drafts')
        .select('updated_at, last_edited_by')
        .eq('id', draftId)
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
      return buildDraftConflictResponse({
        updatedAt: fallbackUpdatedAt,
        lastEditedBy: currentDraft?.last_edited_by || null,
        lastUpdatedByDisplayName,
      })
    }

    if (appendError.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (appendError.message === 'Draft not found') {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (isPermissionDeniedError(appendError)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return createErrorResponse(appendError, 'Failed to append draft images')
  }

  return NextResponse.json({ success: true, draft: appendResultRaw || null })
}
