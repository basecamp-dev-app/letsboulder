import imageCompression from 'browser-image-compression'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { isHeicFile } from '@/lib/image-utils'
import { THUMBNAIL_MAX_WIDTH } from '@/features/submissions/upload/lib/upload-types'

export async function getImageDimensions(source: Blob) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const objectUrl = URL.createObjectURL(source)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: image.naturalWidth || 1200, height: image.naturalHeight || 1200 })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: 1200, height: 1200 })
    }
    image.src = objectUrl
  })
}

export async function buildPreviewUrl(file: File) {
  const previewBlob = await imageCompression(file, {
    maxWidthOrHeight: THUMBNAIL_MAX_WIDTH,
    initialQuality: 0.7,
    fileType: 'image/jpeg',
    useWebWorker: true,
  }).catch(() => file)

  return URL.createObjectURL(previewBlob)
}

export async function preprocessFile(file: File) {
  if (isHeicFile(file)) {
    return new File(
      [await convertHeicToJpegBlob(file)],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    )
  }
  return file
}
