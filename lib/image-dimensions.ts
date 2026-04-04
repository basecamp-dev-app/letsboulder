export interface ImageDimensions {
  width: number
  height: number
}

export async function getImageDimensions(source: File | Blob | string): Promise<ImageDimensions> {
  const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(objectUrl)
      }
      resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 })
    }
    image.onerror = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(objectUrl)
      }
      resolve({ width: 0, height: 0 })
    }
    image.src = objectUrl
  })
}
