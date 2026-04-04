import { compressImage } from '@/lib/image-compression'
import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, uploadFileToMediaSession } from '@/lib/media/client-upload'
import type { GpsData } from '@/types/domain'
import type { NewImageSelection } from '@/features/submissions/lib/submission-types'
import { isHeicFile } from '@/lib/image-utils'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { extractGpsFromBuffer, extractGpsFromFile } from '@/lib/image-gps'
import { getImageDimensions, type ImageDimensions } from '@/lib/image-dimensions'

export { getImageDimensions, type ImageDimensions }

interface MediaUploadSession {
  imageId: string
  objectKey: string
  bucket: string
  uploadUrl: string
  uploadHeaders: Record<string, string>
}

export interface SubmissionImageGpsDetection {
  gpsData: GpsData | null
  gpsSource: 'original-file' | 'heic-preview' | 'none'
  previewBlob: Blob | null
}

export async function detectSubmissionImageGps(file: File): Promise<SubmissionImageGpsDetection> {
  const gpsFromFile = await extractGpsFromFile(file)

  if (!isHeicFile(file)) {
    return {
      gpsData: gpsFromFile,
      gpsSource: gpsFromFile ? 'original-file' : 'none',
      previewBlob: null,
    }
  }

  const previewBlob = await convertHeicToJpegBlob(file)

  if (!gpsFromFile) {
    try {
      const previewBuffer = await previewBlob.arrayBuffer()
      const gpsFromPreview = await extractGpsFromBuffer(previewBuffer, `${file.name} (preview-converted)`, previewBlob.type)
      if (gpsFromPreview) {
        return {
          gpsData: gpsFromPreview,
          gpsSource: 'heic-preview',
          previewBlob,
        }
      }
    } catch {
      // Preserve the existing behavior: preview GPS fallback is best-effort.
    }
  }

  return {
    gpsData: gpsFromFile,
    gpsSource: gpsFromFile ? 'original-file' : 'none',
    previewBlob,
  }
}

export async function compressSubmissionImage(file: File, previewBlob: Blob | null = null): Promise<File> {
  let sourceFile = file

  if (isHeicFile(file)) {
    if (previewBlob) {
      sourceFile = new File([previewBlob], file.name, { type: previewBlob.type })
    } else {
      try {
        const jpegBlob = await convertHeicToJpegBlob(file)
        sourceFile = new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
      } catch {
        throw new Error('Failed to convert HEIC image. Please try a different file.')
      }
    }
  }

  return compressImage(sourceFile, {
    maxWidthOrHeight: 1200,
    maxSizeKB: 307,
    initialQuality: 0.9,
    minQuality: 0.4,
    stripExif: true,
    convertHeic: false,
  })
}

export async function uploadSubmissionImageSession(file: File, gpsData: GpsData | null): Promise<MediaUploadSession> {
  const objectUrl = URL.createObjectURL(file)
  const dimensions = await getImageDimensions(objectUrl)
  URL.revokeObjectURL(objectUrl)
  const fileName = file.name.trim() || `upload.${(file.type || 'image/jpeg').split('/')[1] || 'jpg'}`
  const uploadSession = await createMediaUploadSession({
    purpose: 'submission_image',
    contentType: file.type || 'image/jpeg',
    fileName,
    byteSize: file.size,
    gpsData,
    captureDate: null,
    width: dimensions.width,
    height: dimensions.height,
  })

  try {
    await uploadFileToMediaSession(uploadSession.uploadUrl, uploadSession.uploadHeaders, file)
    await completeMediaUploadSession(uploadSession.imageId)
    return uploadSession
  } catch (error) {
    await deleteMediaUploadSession(uploadSession.imageId).catch(() => null)
    throw error
  }
}

export function buildSubmittedImageSelection(
  uploadSession: MediaUploadSession,
  previewUrl: string,
  gpsData: GpsData | null,
  dimensions: ImageDimensions
): NewImageSelection {
  return {
    mode: 'new',
    images: [
      {
        uploadedImageId: uploadSession.imageId,
        uploadedBucket: uploadSession.bucket,
        uploadedPath: uploadSession.objectKey,
        uploadedUrl: previewUrl,
        gpsData,
        captureDate: null,
        width: dimensions.width,
        height: dimensions.height,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
      },
    ],
    primaryIndex: 0,
  }
}
