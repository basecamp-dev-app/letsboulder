import type { DraftImageRef } from '@/types/submissions'

export interface DraftPreviewImageRef extends DraftImageRef {
  display_order: number
  processing_status: 'pending' | 'queued' | 'processing' | 'ready' | 'failed' | null
}

export function selectPreferredDraftPreviewImage<T extends DraftPreviewImageRef>(images: T[] | null | undefined): T | null {
  const sortedImages = (images || []).slice().sort((a, b) => a.display_order - b.display_order)
  const preferredImage = sortedImages.find((image) => image.processing_status === 'ready') || sortedImages[0] || null
  if (!preferredImage?.storage_bucket || !preferredImage.storage_path) {
    return null
  }

  return preferredImage
}
