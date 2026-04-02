'use client'

import { useCallback, useState } from 'react'
import { publishSubmissionDraftAction } from '@/features/submissions/actions/manage-submissions'

interface PublishDraftResult {
  ok: boolean
  imageId: string | null
  imageCount: number
  routeCount: number
}

export function usePublishDraft(refresh: () => Promise<void>) {
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)

  const publishDraft = useCallback(async (draftId: string): Promise<PublishDraftResult> => {
    setPublishingDraftId(draftId)
    try {
      const result = await publishSubmissionDraftAction(draftId)
      const payload = (result.data || {}) as {
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
      }
      if (!result.success) {
        throw new Error('Failed to publish draft')
      }

      await refresh()
      const imageIds = Array.isArray(payload.published?.imageIds) ? payload.published.imageIds : []
      const routeLineIds = Array.isArray(payload.published?.routeLineIds) ? payload.published.routeLineIds : []
      return {
        ok: true,
        imageId: payload.published?.imageId || null,
        imageCount: imageIds.length > 0 ? imageIds.length : (payload.published?.imageId ? 1 : 0),
        routeCount: routeLineIds.length,
      }
    } catch {
      return {
        ok: false,
        imageId: null,
        imageCount: 0,
        routeCount: 0,
      }
    } finally {
      setPublishingDraftId(null)
    }
  }, [refresh])

  return {
    publishingDraftId,
    publishDraft,
  }
}
