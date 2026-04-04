import { compressImage } from '@/lib/image-compression'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { isHeicFile } from '@/lib/image-utils'
import { THUMBNAIL_MAX_WIDTH } from '@/features/submissions/upload/lib/upload-types'
import { getImageDimensions } from '@/lib/image-dimensions'

export { getImageDimensions }

export async function buildPreviewUrl(file: File) {
  const compressedBlob = await compressImage(file, {
    maxWidthOrHeight: THUMBNAIL_MAX_WIDTH,
    initialQuality: 0.7,
    convertHeic: true,
  }).catch(() => file)

  return URL.createObjectURL(compressedBlob)
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
