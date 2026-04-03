import { blobToDataURL, isHeicFile } from '@/lib/image-utils'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'

export interface ImageCompressionOptions {
  maxWidthOrHeight: number
  maxSizeKB?: number
  initialQuality?: number
  minQuality?: number
  fileType?: string
  stripExif?: boolean
  convertHeic?: boolean
}

const DEFAULTS = {
  initialQuality: 0.9,
  minQuality: 0.4,
  fileType: 'image/jpeg',
  stripExif: false,
  convertHeic: false,
} as const

export async function compressImage(file: File, options: ImageCompressionOptions): Promise<File> {
  const {
    maxWidthOrHeight,
    maxSizeKB,
    initialQuality = DEFAULTS.initialQuality,
    minQuality = DEFAULTS.minQuality,
    fileType = DEFAULTS.fileType,
    stripExif = DEFAULTS.stripExif,
    convertHeic = DEFAULTS.convertHeic,
  } = options

  let sourceData: string | ArrayBuffer | null = null
  let outputFileName = file.name

  if (convertHeic && isHeicFile(file)) {
    try {
      const jpegBlob = await convertHeicToJpegBlob(file)
      sourceData = await blobToDataURL(jpegBlob)
      outputFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
    } catch {
      throw new Error('Failed to convert HEIC image. Please try a different file.')
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        let { width, height } = img
        if (width > height) {
          if (width > maxWidthOrHeight) {
            height = Math.round((height * maxWidthOrHeight) / width)
            width = maxWidthOrHeight
          }
        } else if (height > maxWidthOrHeight) {
          width = Math.round((width * maxWidthOrHeight) / height)
          height = maxWidthOrHeight
        }

        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)

        const targetSize = maxSizeKB ? maxSizeKB * 1024 : undefined
        let quality = initialQuality

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
              fileType,
              quality
            )
          })

          if (!targetSize || blob.size <= targetSize || quality === minQuality) {
            let resultFile = new File([blob], outputFileName, {
              type: fileType,
              lastModified: Date.now(),
            })

            if (stripExif) {
              const { stripExifMetadataFromFile } = await import('@/lib/image-metadata')
              resultFile = await stripExifMetadataFromFile(resultFile)
            }

            resolve(resultFile)
            return
          }

          quality = Math.max(minQuality, Number((quality - 0.1).toFixed(2)))
        }

        reject(new Error('Failed to compress image'))
      }

      img.onerror = () => reject(new Error(`Failed to load image for compression. File type: ${file.type}`))
      img.src = (sourceData || event.target?.result) as string
    }

    reader.onerror = () => reject(new Error('Failed to read file'))

    if (sourceData) {
      reader.onload({ target: { result: sourceData } } as ProgressEvent<FileReader>)
    } else {
      reader.readAsDataURL(file)
    }
  })
}
