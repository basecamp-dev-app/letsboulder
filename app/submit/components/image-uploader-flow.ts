import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, uploadFileToMediaSession } from '@/lib/media/client-upload'
import type { GpsData, NewImageSelection } from '@/features/submissions/lib/submission-types'
import { stripExifMetadataFromFile } from '@/lib/image-metadata'
import { blobToDataURL, isHeicFile } from '@/lib/image-utils'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { extractGpsFromBuffer, extractGpsFromFile } from '@/lib/image-gps'

interface MediaUploadSession {
  imageId: string
  objectKey: string
  bucket: string
  uploadUrl: string
  uploadHeaders: Record<string, string>
}

interface UploadDimensions {
  width: number
  height: number
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
  let sourceData: string | ArrayBuffer | null = null

  if (isHeicFile(file)) {
    if (previewBlob) {
      sourceData = await blobToDataURL(previewBlob)
    } else {
      try {
        const jpegBlob = await convertHeicToJpegBlob(file)
        sourceData = await blobToDataURL(jpegBlob)
      } catch {
        throw new Error('Failed to convert HEIC image. Please try a different file.')
      }
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()
      const imgSrc = sourceData || (e.target?.result as string)

      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        let { width, height } = img
        const maxDim = 1200

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }

        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)

        try {
          let quality = 0.9
          const minQuality = 0.4
          const targetSize = 0.3 * 1024 * 1024

          while (quality >= minQuality) {
            const blob = await new Promise<Blob>((blobResolve, blobReject) => {
              canvas.toBlob(
                (nextBlob) => {
                  if (!nextBlob) {
                    blobReject(new Error('Failed to generate compressed image blob'))
                    return
                  }
                  blobResolve(nextBlob)
                },
                'image/jpeg',
                quality
              )
            })

            if (blob.size <= targetSize || quality === minQuality) {
              const compressedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              resolve(stripExifMetadataFromFile(compressedFile))
              return
            }

            quality = Math.max(minQuality, Number((quality - 0.1).toFixed(2)))
          }

          reject(new Error('Failed to compress image'))
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to compress image'))
        }
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image for compression. File type: ${file.type}`))
      }

      img.src = imgSrc
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    if (sourceData) {
      reader.onload({ target: { result: sourceData } } as ProgressEvent<FileReader>)
    } else {
      reader.readAsDataURL(file)
    }
  })
}

export async function getImageDimensions(source: string): Promise<UploadDimensions> {
  const img = new Image()
  img.src = source

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })

  return {
    width: img.naturalWidth || 0,
    height: img.naturalHeight || 0,
  }
}

export async function uploadSubmissionImageSession(file: File, gpsData: GpsData | null): Promise<MediaUploadSession> {
  const uploadSession = await createMediaUploadSession({
    purpose: 'submission_image',
    contentType: file.type || 'image/jpeg',
    fileName: file.name,
    byteSize: file.size,
    gpsData,
    captureDate: null,
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
  dimensions: UploadDimensions
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
