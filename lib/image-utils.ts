export function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function isHeicFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime === 'image/heic' || mime === 'image/heif' || mime === 'image/heic-sequence' || mime === 'image/heif-sequence') {
    return true
  }

  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
}

export function isSupportedImageFile(file: File): boolean {
  if ((file.type || '').toLowerCase().startsWith('image/')) return true

  const lowerName = file.name.toLowerCase()
  return [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.heic',
    '.heif',
  ].some((ext) => lowerName.endsWith(ext))
}
