import { randomUUID } from 'node:crypto'
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

const MAX_BYTE_SIZE = 20 * 1024 * 1024
const MAX_DIMENSION = 20_000

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

function normalizeFileName(fileName: unknown, contentType: string): string {
  if (typeof fileName === 'string') {
    const trimmed = fileName.trim()
    if (trimmed) return trimmed
  }

  return `upload.${inferExtension('', contentType)}`
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

  const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (typeof candidate.contentType !== 'string' || !allowedContentTypes.includes(candidate.contentType)) {
    throw new Error('Invalid content type')
  }

  if (
    typeof candidate.byteSize !== 'number' ||
    !Number.isFinite(candidate.byteSize) ||
    candidate.byteSize <= 0 ||
    candidate.byteSize > MAX_BYTE_SIZE
  ) {
    throw new Error('Invalid byte size')
  }

  if (
    typeof candidate.width !== 'number' ||
    !Number.isFinite(candidate.width) ||
    candidate.width <= 0 ||
    candidate.width > MAX_DIMENSION
  ) {
    throw new Error('Invalid width')
  }

  if (
    typeof candidate.height !== 'number' ||
    !Number.isFinite(candidate.height) ||
    candidate.height <= 0 ||
    candidate.height > MAX_DIMENSION
  ) {
    throw new Error('Invalid height')
  }

  const gpsData = (() => {
    const gpsValue = candidate['gpsData']
    if (!gpsValue || typeof gpsValue !== 'object') return null
    const gps = gpsValue as Record<string, unknown>
    if (typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') return null
    if (gps.latitude < -90 || gps.latitude > 90 || gps.longitude < -180 || gps.longitude > 180) return null
    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
    }
  })()

  return {
    purpose: candidate.purpose,
    contentType: candidate.contentType,
    fileName: normalizeFileName(candidate.fileName, candidate.contentType),
    byteSize: candidate.byteSize,
    gpsData,
    captureDate: typeof candidate['captureDate'] === 'string' && candidate['captureDate'] ? candidate['captureDate'] : null,
    width: candidate.width,
    height: candidate.height,
    draftId: typeof candidate.draftId === 'string' && candidate.draftId ? candidate.draftId : null,
    cragId: typeof candidate.cragId === 'string' && candidate.cragId ? candidate.cragId : null,
  }
}

export function buildStagingObjectKey(imageId: string, request: MediaUploadSessionRequest): string {
  const extension = inferExtension(request.fileName, request.contentType)
  const uuid = randomUUID()
  return `images/staging/${imageId}/${uuid}/original.${extension}`
}

export function buildImmutableObjectKey(imageId: string, sha256: string, extension: string): string {
  return `images/assets/${imageId}/${sha256}/original.${extension}`
}

export function inferExtensionFromMime(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType.toLowerCase()] ?? 'jpg'
}

export function buildOriginalObjectKey(imageId: string, request: MediaUploadSessionRequest): string {
  const extension = inferExtension(request.fileName, request.contentType)
  return `images/originals/${imageId}/original.${extension}`
}
