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

function outputExtension(fileType: string): string {
  if (fileType === 'image/jpeg' || fileType === 'image/jpg') return '.jpg'
  if (fileType === 'image/svg+xml') return '.svg'

  const subtype = fileType.split('/')[1]?.split(';')[0]
  return subtype && /^[a-z0-9]+$/i.test(subtype) ? `.${subtype}` : '.bin'
}

export async function compressImage(file: File, options: ImageCompressionOptions): Promise<File> {
  if (typeof document === 'undefined') {
    throw new Error('compressImage requires a browser environment')
  }

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
  const extension = outputExtension(fileType)
  const outputFileName = /\.[^.]+$/.test(file.name)
    ? file.name.replace(/\.[^.]+$/, extension)
    : `${file.name}${extension}`

  if (convertHeic && isHeicFile(file)) {
    try {
      const jpegBlob = await convertHeicToJpegBlob(file)
      sourceData = await blobToDataURL(jpegBlob)
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
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'))
          return
        }

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
        ctx.drawImage(img, 0, 0, width, height)

        const targetSize = maxSizeKB === undefined ? undefined : maxSizeKB * 1024
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

          if (!targetSize || blob.size <= targetSize) {
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

          if (quality === minQuality) {
            reject(new Error(`Failed to compress image below ${maxSizeKB} KB`))
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
