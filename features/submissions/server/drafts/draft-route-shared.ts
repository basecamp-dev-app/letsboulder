import { NextResponse } from 'next/server'

export interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name: string | null
  }
}

export interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url?: string | null
  first_name?: string | null
  last_name?: string | null
}

export interface DraftPatchImage {
  id: string
  display_order: number
  route_data: unknown
}

export interface DraftImageRow {
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
  processing_status: 'pending' | 'queued' | 'processing' | 'ready' | 'failed' | null
  preview_variants: unknown
}

export interface DraftRouteRow {
  id: string
  draft_image_id: string
  name: string
  grade: string
  description: string | null
  climb_type: string
  points: unknown
  sequence_order: number
  image_width: number | null
  image_height: number | null
  created_at: string
  updated_at: string
}

export function buildDraftImageProxyUrl(draftId: string, path: string): string {
  const searchParams = new URLSearchParams({ draftId, path })
  return `/api/media/private?${searchParams.toString()}`
}

export function resolveDisplayName(profile: ProfileRow | null): string | null {
  if (!profile) return null
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return null
}

export function resolveDraftPersonLabel(profile: ProfileRow | null, userId: string): string {
  if (!profile) return `user_${userId.slice(0, 8)}`
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  const fullName = [profile.first_name || '', profile.last_name || ''].join(' ').trim()
  if (fullName) return fullName
  return `user_${userId.slice(0, 8)}`
}

export interface DatabaseErrorLike {
  message?: string
  details?: string
  hint?: string
  code?: string
}

export function isPermissionDeniedError(error: DatabaseErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42501') return true

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('violates row-level security policy')
  )
}

export function extractDraftLocation(metadata: unknown) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {}
  const location = (safeMetadata.submission && typeof safeMetadata.submission === 'object' &&
    (safeMetadata.submission as Record<string, unknown>).location &&
    typeof (safeMetadata.submission as Record<string, unknown>).location === 'object')
    ? (safeMetadata.submission as Record<string, unknown>).location as Record<string, unknown>
    : (safeMetadata.location && typeof safeMetadata.location === 'object'
        ? safeMetadata.location as Record<string, unknown>
        : null)

  const latitude = location && typeof location.latitude === 'number' ? location.latitude : null
  const longitude = location && typeof location.longitude === 'number' ? location.longitude : null
  return { latitude, longitude }
}

export function hasValidDraftCoordinate(latitude: number | null, longitude: number | null): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0)
}

export function resolveEffectiveDraftPublishLocation(
  metadata: unknown,
  draftImages: Array<Pick<DraftImageRow, 'latitude' | 'longitude'>>,
) {
  const draftLocation = extractDraftLocation(metadata)
  if (hasValidDraftCoordinate(draftLocation.latitude, draftLocation.longitude)) {
    return draftLocation
  }

  for (const image of draftImages) {
    if (hasValidDraftCoordinate(image.latitude, image.longitude)) {
      return {
        latitude: image.latitude,
        longitude: image.longitude,
      }
    }
  }

  return { latitude: null, longitude: null }
}

export function normalizeJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizePatchImages(value: unknown): DraftPatchImage[] | null {
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

export function resolveDraftImageReadinessStatus(image: DraftImageRow): 'processing' | 'ready' | 'error' {
  if (image.storage_bucket && image.storage_path && image.processing_status === 'ready') return 'ready'
  if (!image.storage_bucket || !image.storage_path || image.processing_status === 'failed') return 'error'
  return 'processing'
}

export function buildDraftConflictResponse(input: {
  updatedAt: string
  lastEditedBy: string | null
  lastUpdatedByDisplayName: string | null
}) {
  const conflictPayload: DraftConflictResponse = {
    code: 'draft_conflict',
    message: 'This draft was updated by another collaborator. Reload to continue editing.',
    current_updated_at: input.updatedAt,
    current_data: {
      updated_at: input.updatedAt,
      last_updated_by: input.lastEditedBy,
      last_updated_by_display_name: input.lastUpdatedByDisplayName,
    },
  }

  return NextResponse.json(conflictPayload, { status: 409 })
}
