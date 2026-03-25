export const MEDIA_VARIANT_KEYS = ['thumb', 'card', 'detail', 'topo', 'full'] as const

export const MEDIA_FORMAT_KEYS = ['avif', 'webp', 'jpeg'] as const

export type MediaVariantKey = (typeof MEDIA_VARIANT_KEYS)[number]
export type MediaFormatKey = (typeof MEDIA_FORMAT_KEYS)[number]

export type MediaVisibility = 'private' | 'public'

export type MediaProcessingStatus = 'pending' | 'queued' | 'processing' | 'ready' | 'failed'

export type MediaIngestTrigger = 'upload' | 'backfill'

export type MediaModerationStatus = 'pending' | 'approved' | 'rejected' | 'skipped' | 'error'

export type MediaModerationProvider = 'aws_rekognition' | 'disabled'

export interface MediaVariantAsset {
  path: string
  width: number
  height: number
  bytes?: number | null
  contentType?: string | null
}

export type MediaVariantFormatMap = Partial<Record<MediaFormatKey, MediaVariantAsset>>

export type MediaVariantManifest = Partial<Record<MediaVariantKey, MediaVariantFormatMap>>

export type MediaUploadPurpose = 'submission_image' | 'draft_image' | 'crag_image'

export interface MediaUploadSessionRequest {
  purpose: MediaUploadPurpose
  contentType: string
  fileName: string
  byteSize: number
  gpsData?: {
    latitude: number
    longitude: number
  } | null
  captureDate?: string | null
  width?: number | null
  height?: number | null
  draftId?: string | null
  cragId?: string | null
}

export interface MediaUploadSessionResponse {
  imageId: string
  objectKey: string
  bucket: string
  uploadUrl: string
  uploadMethod: 'PUT'
  uploadHeaders: Record<string, string>
  expiresInSeconds: number
}

export interface MediaIngestJobPayload {
  imageId: string
  originalBucket: string
  originalKey: string
  storageProvider: 'supabase' | 'r2'
  purpose: MediaUploadPurpose
  triggeredByUserId: string
  trigger?: MediaIngestTrigger
}

export interface MediaJobRow {
  id: string
  image_id: string
  job_type: 'ingest_image'
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  payload: MediaIngestJobPayload
  attempts: number
  max_attempts: number
  run_at: string
  locked_at: string | null
  locked_by: string | null
  last_error: string | null
}
