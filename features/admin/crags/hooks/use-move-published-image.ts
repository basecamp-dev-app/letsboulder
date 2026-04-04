'use client'

import { useCallback, useMemo, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import { getResponseError } from '@/lib/response-error'
import type { AdminCrag, CragImageRouteCandidate, MoveImageState } from '@/features/admin/crags/types'

export function useMovePublishedImage(onToast: (message: string, duration?: number) => void, onMoved: () => void) {
  const [movingImage, setMovingImage] = useState<MoveImageState | null>(null)
  const [moveCandidates, setMoveCandidates] = useState<CragImageRouteCandidate[]>([])
  const [loadingMoveCandidates, setLoadingMoveCandidates] = useState(false)
  const [selectedTargetCragId, setSelectedTargetCragId] = useState('')
  const [movingPublishedImage, setMovingPublishedImage] = useState(false)

  const closeMoveDialog = useCallback(() => {
    setMovingImage(null)
    setMoveCandidates([])
    setSelectedTargetCragId('')
  }, [])

  const selectMoveImageId = useCallback((imageId: string) => {
    setMovingImage(current => (current ? { ...current, imageId } : current))
  }, [])

  const openMoveDialog = useCallback(async (crag: AdminCrag) => {
    setMovingImage({ sourceCrag: crag, imageId: '' })
    setMoveCandidates([])
    setSelectedTargetCragId('')
    setLoadingMoveCandidates(true)

    try {
      const response = await fetch(`/api/crags/${crag.id}/images`, { cache: 'no-store' })
      const data = await response.json().catch(() => null) as {
        images?: Array<{ id?: string; signed_url?: string | null; created_at?: string | null }>
      } | null

      if (!response.ok || !Array.isArray(data?.images)) {
        onToast('Failed to load published route images for this crag', 3000)
        return
      }

      const candidateRequests = data.images
        .map((image) => (typeof image.id === 'string' && image.id
          ? { imageId: image.id, imageUrl: image.signed_url ?? null, createdAt: image.created_at ?? null }
          : null))
        .filter((image): image is { imageId: string; imageUrl: string | null; createdAt: string | null } => image !== null)

      const candidateResults = await Promise.all(candidateRequests.map(async (candidate) => {
        const routeResponse = await fetch(`/api/image/${candidate.imageId}/routes`, { cache: 'no-store' })
        const routeData = await routeResponse.json().catch(() => null) as {
          routes?: Array<{ climb?: { name?: string | null } | null }>
        } | null
        const routes = Array.isArray(routeData?.routes) ? routeData.routes : []
        if (!routeResponse.ok || routes.length === 0) return null

        return {
          imageId: candidate.imageId,
          imageUrl: candidate.imageUrl,
          createdAt: candidate.createdAt,
          climbCount: routes.length,
          climbNames: routes
            .map((route) => route.climb?.name?.trim() || 'Unnamed route')
            .slice(0, 3),
        } satisfies CragImageRouteCandidate
      }))

      const nextCandidates = candidateResults.filter((candidate): candidate is CragImageRouteCandidate => candidate !== null)
      setMoveCandidates(nextCandidates)
      if (nextCandidates.length > 0) {
        setMovingImage({ sourceCrag: crag, imageId: nextCandidates[0].imageId })
        setSelectedTargetCragId('')
      }
    } catch {
      onToast('Failed to load published route images for this crag', 3000)
    } finally {
      setLoadingMoveCandidates(false)
    }
  }, [onToast])

  const movePublishedImage = useCallback(async () => {
    if (!movingImage?.imageId || !selectedTargetCragId) return

    setMovingPublishedImage(true)
    try {
      const response = await csrfFetch(`/api/admin/images/${movingImage.imageId}/move-crag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCragId: selectedTargetCragId }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null

      if (!response.ok) {
        onToast(getResponseError(payload, 'Failed to move published image'), 4000)
        return
      }

      onToast(payload?.message || 'Published image moved', 4000)
      closeMoveDialog()
      onMoved()
    } catch {
      onToast('Failed to move published image', 4000)
    } finally {
      setMovingPublishedImage(false)
    }
  }, [closeMoveDialog, movingImage?.imageId, onMoved, onToast, selectedTargetCragId])

  const selectedMoveCandidate = useMemo(
    () => moveCandidates.find(candidate => candidate.imageId === movingImage?.imageId) || null,
    [moveCandidates, movingImage?.imageId]
  )

  return {
    closeMoveDialog,
    loadingMoveCandidates,
    moveCandidates,
    movePublishedImage,
    movingImage,
    movingPublishedImage,
    openMoveDialog,
    selectedMoveCandidate,
    selectMoveImageId,
    selectedTargetCragId,
    setSelectedTargetCragId,
  }
}
