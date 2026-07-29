import imageCompression from 'browser-image-compression'
import { compressImage } from '@/lib/image-compression'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { isHeicFile } from '@/lib/image-utils'
import { THUMBNAIL_MAX_WIDTH } from '@/features/media-upload/lib/upload-types'
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
  let sourceFile = file
  if (isHeicFile(file)) {
    sourceFile = new File(
      [await convertHeicToJpegBlob(file)],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      { type: 'image/jpeg', lastModified: file.lastModified }
    )
  }

  const compressed = await imageCompression(sourceFile, {
    maxWidthOrHeight: 3200,
    maxSizeMB: 3,
    initialQuality: 0.88,
    fileType: 'image/jpeg',
    preserveExif: false,
    useWebWorker: false,
  })
  const jpegName = sourceFile.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([compressed], jpegName, {
    type: 'image/jpeg',
    lastModified: sourceFile.lastModified,
  })
}
