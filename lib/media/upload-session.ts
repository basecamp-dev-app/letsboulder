import path from 'node:path'
import type { MediaUploadPurpose, MediaUploadSessionRequest } from '@/lib/media/types'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

function sanitizeExtension(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return normalized || null
}

function inferExtension(fileName: string, contentType: string): string {
  const fromMime = MIME_EXTENSION_MAP[contentType.toLowerCase()]
  if (fromMime) return fromMime

  const parsed = sanitizeExtension(path.extname(fileName))
  if (parsed) return parsed

  return 'jpg'
}

function isAllowedPurpose(value: string): value is MediaUploadPurpose {
  return value === 'submission_image' || value === 'draft_image' || value === 'crag_image'
}

export function normalizeUploadSessionRequest(input: unknown): MediaUploadSessionRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid upload session payload')
  }

  const candidate = input as Record<string, unknown>

  if (typeof candidate.purpose !== 'string' || !isAllowedPurpose(candidate.purpose)) {
    throw new Error('Invalid media upload purpose')
  }

  if (typeof candidate.contentType !== 'string' || !candidate.contentType.startsWith('image/')) {
    throw new Error('Invalid content type')
  }

  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Invalid file name')
  }

  if (typeof candidate.byteSize !== 'number' || !Number.isFinite(candidate.byteSize) || candidate.byteSize <= 0) {
    throw new Error('Invalid byte size')
  }

  return {
    purpose: candidate.purpose,
    contentType: candidate.contentType,
    fileName: candidate.fileName,
    byteSize: candidate.byteSize,
    gpsData: (() => {
      const gpsValue = candidate['gpsData']
      if (!gpsValue || typeof gpsValue !== 'object') return null
      const gps = gpsValue as Record<string, unknown>
      if (typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') return null
      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
      }
    })(),
    captureDate: typeof candidate['captureDate'] === 'string' && candidate['captureDate'] ? candidate['captureDate'] : null,
    width: typeof candidate.width === 'number' && Number.isFinite(candidate.width) ? candidate.width : null,
    height: typeof candidate.height === 'number' && Number.isFinite(candidate.height) ? candidate.height : null,
    draftId: typeof candidate.draftId === 'string' && candidate.draftId ? candidate.draftId : null,
    cragId: typeof candidate.cragId === 'string' && candidate.cragId ? candidate.cragId : null,
  }
}

export function buildOriginalObjectKey(imageId: string, request: MediaUploadSessionRequest): string {
  const extension = inferExtension(request.fileName, request.contentType)
  return `images/originals/${imageId}/original.${extension}`
}
