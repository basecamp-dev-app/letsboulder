import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

interface DraftCreateImageInput {
  uploadedBucket: string
  uploadedPath: string
  gpsData?: {
    latitude: number
    longitude: number
  } | null
  captureDate?: string | null
  width?: number
  height?: number
}

interface DraftRoutePayload {
  id: string
  name: string
  grade: string
  description?: string | null
  climbType: string
  points: Array<{ x: number; y: number }>
  sequenceOrder: number
  imageWidth?: number | null
  imageHeight?: number | null
}

interface DraftRouteBatchInput {
  draftImageId: string
  routes: DraftRoutePayload[]
}

export function normalizeCreateImages(value: unknown): DraftCreateImageInput[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null

  const images: DraftCreateImageInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftCreateImageInput>
    if (typeof candidate.uploadedBucket !== 'string' || !candidate.uploadedBucket) return null
    if (typeof candidate.uploadedPath !== 'string' || !candidate.uploadedPath) return null

    images.push({
      uploadedBucket: candidate.uploadedBucket,
      uploadedPath: candidate.uploadedPath,
      gpsData: candidate.gpsData && typeof candidate.gpsData === 'object' && typeof candidate.gpsData.latitude === 'number' && typeof candidate.gpsData.longitude === 'number'
        ? { latitude: candidate.gpsData.latitude, longitude: candidate.gpsData.longitude }
        : null,
      captureDate: typeof candidate.captureDate === 'string' && candidate.captureDate ? candidate.captureDate : null,
      width: typeof candidate.width === 'number' ? candidate.width : undefined,
      height: typeof candidate.height === 'number' ? candidate.height : undefined,
    })
  }

  return images
}

export function buildUploadSignature(images: DraftCreateImageInput[]): string {
  return images.map((image) => `${image.uploadedBucket}/${image.uploadedPath}`).sort().join('|')
}

export async function validateDraftImageOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
  images: DraftCreateImageInput[]
) {
  for (const image of images) {
    if (!(await userOwnsUploadedObject(supabase, userId, image.uploadedBucket, image.uploadedPath))) {
      return NextResponse.json({ error: 'Invalid uploaded path owner' }, { status: 403 })
    }
  }
  return null
}

export function normalizeDraftRoutePayload(value: unknown): DraftRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: DraftRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftRoutePayload>
    if (typeof candidate.id !== 'string' || !candidate.id) return null
    if (typeof candidate.name !== 'string') return null
    if (typeof candidate.grade !== 'string') return null
    if (typeof candidate.climbType !== 'string') return null
    if (!Array.isArray(candidate.points)) return null
    if (typeof candidate.sequenceOrder !== 'number') return null

    routes.push({
      id: candidate.id,
      name: candidate.name,
      grade: candidate.grade,
      description: typeof candidate.description === 'string' ? candidate.description : null,
      climbType: candidate.climbType,
      points: candidate.points.map((point) => ({
        x: typeof point?.x === 'number' ? point.x : 0,
        y: typeof point?.y === 'number' ? point.y : 0,
      })),
      sequenceOrder: candidate.sequenceOrder,
      imageWidth: typeof candidate.imageWidth === 'number' ? candidate.imageWidth : null,
      imageHeight: typeof candidate.imageHeight === 'number' ? candidate.imageHeight : null,
    })
  }

  return routes
}

export function normalizeDraftRouteBatchPayload(value: unknown): DraftRouteBatchInput[] | null {
  if (!Array.isArray(value)) return null

  const batches: DraftRouteBatchInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as { draftImageId?: unknown; routes?: unknown }
    if (typeof candidate.draftImageId !== 'string' || !candidate.draftImageId) return null
    const routes = normalizeDraftRoutePayload(candidate.routes)
    if (!routes) return null
    batches.push({ draftImageId: candidate.draftImageId, routes })
  }

  return batches
}

export async function assertDraftReadAccess(
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>,
  draftId: string,
  userId: string
) {
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError || !draft) {
    return { error: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) }
  }

  if (draft.user_id !== userId) {
    const { data: collaboratorAccess } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id')
      .eq('draft_id', draftId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!collaboratorAccess) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
  }

  return { draft }
}

export function draftRouteErrorResponse(error: unknown, message: string) {
  return createErrorResponse(error, message)
}
