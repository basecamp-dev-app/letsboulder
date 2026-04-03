import { compressImage as compressImageUtil } from '@/lib/image-compression'

export async function compressImage(file: File, maxSizeKB: number, maxDim: number): Promise<File> {
  return compressImageUtil(file, {
    maxWidthOrHeight: maxDim,
    maxSizeKB,
    initialQuality: 0.9,
    minQuality: 0.1,
  })
}

export function extractStoragePath(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl)
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)
    if (match) return match[1]

    const directMatch = url.pathname.match(/\/avatars\/(.+)$/)
    if (directMatch) return directMatch[1]

    return null
  } catch {
    return null
  }
}
