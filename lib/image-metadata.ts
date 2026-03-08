'use client'

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to read image metadata'))
    }

    reader.onerror = () => reject(new Error('Failed to read image metadata'))
    reader.readAsDataURL(blob)
  })
}

export async function stripExifMetadataFromFile(file: File): Promise<File> {
  const mimeType = file.type.toLowerCase()
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/jpg') {
    return file
  }

  const piexifModule = await import('piexifjs')
  const piexif = piexifModule.default || piexifModule
  const dataUrl = await readBlobAsDataUrl(file)
  const strippedDataUrl = piexif.remove(dataUrl)
  const strippedBlob = await fetch(strippedDataUrl).then((response) => response.blob())

  return new File([strippedBlob], file.name.replace(/\.(jpeg|jpg)$/i, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
