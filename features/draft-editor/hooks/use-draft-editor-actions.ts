'use client'

import { useCallback } from 'react'
import { sortFaceDirections } from '@/lib/face-directions'
import { reorderItemsByIds, resolveLocationMode } from '@/features/submissions/lib/editor-image-state'
import { csrfFetch } from '@/hooks/useCsrf'
import type { FaceDirection } from '@/features/submissions/lib/submission-types'
import type { DraftCanvasSource, DraftPayload, ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'

interface UseDraftEditorActionsParams {
  draft: DraftPayload | null
  draftId: string
  draftUpdatedAt: string | null
  activeImageId: string | null
  activeDraftImageId: string | null
  activeImageTab: ManageImageTab | null
  cragId: string | null
  markerPosition: [number, number] | null
  quickSwitcherImages: Array<{ imageId: string; sourceKind: 'draft-image' | 'crag-image' }>
  manageImages: ManageImageTab[]
  locationModeByImageId: Record<string, string | null | undefined>
  conflict: { pendingChanges: unknown } | null
  saveDraft: (options?: { overrideCragId?: string }) => Promise<boolean>
  persistMetadataImmediately: (mutator: () => void) => void
  markMetadataDirty: () => void
  focusDrawingArea: (behavior?: ScrollBehavior) => void
  addToast: (message: string, tone: 'success' | 'error') => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
  setManageImages: React.Dispatch<React.SetStateAction<ManageImageTab[]>>
  setDraft: React.Dispatch<React.SetStateAction<DraftPayload | null>>
  setDraftUpdatedAt: (value: string) => void
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  setActiveImageId: (value: string) => void
  setCanvasSource: (value: DraftCanvasSource | null) => void
  setDefaultImageId: (value: string) => void
  setOrientationByImageId: (value: (prev: Record<string, FaceDirection[]>) => Record<string, FaceDirection[]>) => void
  setLocationModeByImageId: (value: (prev: Record<string, 'shared' | 'custom'>) => Record<string, 'shared' | 'custom'>) => void
  setCustomGpsByImageId: (value: (prev: Record<string, { latitude: number | null; longitude: number | null }>) => Record<string, { latitude: number | null; longitude: number | null }>) => void
  setCragId: (value: string) => void
  setSelectedCrag: (value: { id: string; name: string; latitude: number | null; longitude: number | null }) => void
  setCragCanvasImages: (value: []) => void
  setShowCragSelector: (value: boolean) => void
  setHasExplicitRouteType: (value: boolean) => void
  setRouteType: (value: string) => void
  setMapOpen: (value: boolean) => void
  setSwitchingImageId: (value: string | null) => void
  switchingImageLockRef: React.MutableRefObject<boolean>
}

export function useDraftEditorActions(params: UseDraftEditorActionsParams) {
  const {
    draft,
    draftId,
    draftUpdatedAt,
    activeImageId,
    activeDraftImageId,
    activeImageTab,
    cragId,
    markerPosition,
    quickSwitcherImages,
    manageImages,
    locationModeByImageId,
    conflict,
    saveDraft,
    persistMetadataImmediately,
    markMetadataDirty,
    focusDrawingArea,
    addToast,
    setError,
    setSuccess,
    setManageImages,
    setDraft,
    setDraftUpdatedAt,
    registerDraftUpdatedAt,
    setActiveImageId,
    setCanvasSource,
    setDefaultImageId,
    setOrientationByImageId,
    setLocationModeByImageId,
    setCustomGpsByImageId,
    setCragId,
    setSelectedCrag,
    setCragCanvasImages,
    setShowCragSelector,
    setHasExplicitRouteType,
    setRouteType,
    setMapOpen,
    setSwitchingImageId,
    switchingImageLockRef,
  } = params

  const toggleImageOrientation = useCallback((direction: FaceDirection) => {
    if (!activeDraftImageId) return
    setOrientationByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const next = current.includes(direction)
        ? current.filter((value) => value !== direction)
        : [...current, direction]
      return {
        ...prev,
        [activeDraftImageId]: sortFaceDirections(next),
      }
    })
  }, [activeDraftImageId, setOrientationByImageId])

  const handleQuickSwitchImage = useCallback(async (imageId: string) => {
    if (imageId === activeImageId || switchingImageLockRef.current) return
    const targetImage = quickSwitcherImages.find((image) => image.imageId === imageId) || null
    switchingImageLockRef.current = true
    setSwitchingImageId(imageId)

    try {
      setActiveImageId(imageId)
      if (targetImage?.sourceKind === 'crag-image' && cragId) {
        setCanvasSource({ kind: 'crag-image', cragImageId: imageId, cragId })
      } else {
        setCanvasSource({ kind: 'draft-image', draftImageId: imageId })
      }
      window.setTimeout(() => {
        focusDrawingArea('smooth')
      }, 0)
    } finally {
      switchingImageLockRef.current = false
      setSwitchingImageId(null)
    }
  }, [activeImageId, cragId, focusDrawingArea, quickSwitcherImages, setActiveImageId, setCanvasSource, setSwitchingImageId, switchingImageLockRef])

  const handleReorderDraftImages = useCallback(async (imageIds: string[]) => {
    if (!draft || !draftUpdatedAt) return

    const previousManageImages = manageImages
    const nextManageImages = reorderItemsByIds(manageImages, imageIds).map((image) => ({
      ...image,
      locationMode: resolveLocationMode(locationModeByImageId[image.imageId] || image.locationMode),
    }))

    setManageImages(nextManageImages)
    setError(null)

    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: draftUpdatedAt,
          images: nextManageImages
            .filter((image) => image.sourceKind === 'draft-image')
            .map((image, index) => {
              const existingImage = draft.images.find((candidate) => candidate.id === image.imageId)
              return { id: image.imageId, display_order: index, route_data: existingImage?.route_data || {} }
            }),
        }),
      })

      const payload = await response.json().catch(() => ({ error: 'Failed to reorder draft images' })) as { error?: string; draft?: { updated_at?: string } }
      if (!response.ok) throw new Error(payload.error || 'Failed to reorder draft images')

      if (payload.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
        registerDraftUpdatedAt(draftId, payload.draft.updated_at)
      }

      setDraft((current) => {
        if (!current) return current
        const imageById = new Map(current.images.map((image) => [image.id, image]))
        const reorderedImages = imageIds
          .map((imageId, index) => {
            const image = imageById.get(imageId)
            return image ? { ...image, display_order: index } : null
          })
          .filter((image): image is typeof current.images[number] => image !== null)

        return {
          ...current,
          updated_at: payload.draft?.updated_at || current.updated_at,
          images: reorderedImages,
        }
      })
    } catch (err) {
      setManageImages(previousManageImages)
      const message = err instanceof Error ? err.message : 'Failed to reorder draft images'
      setError(message)
      addToast(message, 'error')
    }
  }, [addToast, draft, draftId, draftUpdatedAt, locationModeByImageId, manageImages, registerDraftUpdatedAt, setDraft, setDraftUpdatedAt, setError, setManageImages])

  const setActiveAsDefault = useCallback(() => {
    if (!activeImageTab || activeImageTab.sourceKind !== 'draft-image') return
    persistMetadataImmediately(() => {
      setDefaultImageId(activeImageTab.imageId)
      setCanvasSource({ kind: 'draft-image', draftImageId: activeImageTab.imageId })
    })
  }, [activeImageTab, persistMetadataImmediately, setCanvasSource, setDefaultImageId])

  const handleCopyUnsavedEdits = useCallback(async () => {
    if (!conflict) return
    const textPayload = JSON.stringify(conflict.pendingChanges, null, 2)
    try {
      await navigator.clipboard.writeText(textPayload)
      addToast('Unsaved edits copied', 'success')
    } catch {
      setError('Failed to copy unsaved edits')
    }
  }, [addToast, conflict, setError])

  const onSelectCrag = useCallback((crag: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
    setCragId(crag.id)
    setSelectedCrag(crag)
    setCragCanvasImages([])
    setShowCragSelector(false)
    setSuccess('Crag selected for this draft.')
    markMetadataDirty()
  }, [markMetadataDirty, setCragId, setSelectedCrag, setCragCanvasImages, setShowCragSelector, setSuccess])

  const onCreateCrag = useCallback((crag: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
    setCragId(crag.id)
    setSelectedCrag(crag)
    setCragCanvasImages([])
    setCanvasSource(null)
    setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
    setShowCragSelector(false)
    markMetadataDirty()
  }, [markMetadataDirty, setCragId, setSelectedCrag, setCragCanvasImages, setCanvasSource, setSuccess, setShowCragSelector])

  const onLocationModeChange = useCallback((mode: 'shared' | 'custom') => {
    if (!activeDraftImageId) return
    if (mode === 'shared') {
      setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'shared' }))
      setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'shared' } : image))
      return
    }

    setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'custom' }))
    setCustomGpsByImageId((prev) => ({
      ...prev,
      [activeDraftImageId]: prev[activeDraftImageId] || {
        latitude: markerPosition?.[0] ?? null,
        longitude: markerPosition?.[1] ?? null,
      },
    }))
    setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'custom' } : image))
  }, [activeDraftImageId, setLocationModeByImageId, setManageImages, setCustomGpsByImageId, markerPosition])

  const onRouteTypeChange = useCallback((nextRouteType: string) => {
    persistMetadataImmediately(() => {
      setHasExplicitRouteType(true)
      setRouteType(nextRouteType)
    })
  }, [persistMetadataImmediately, setHasExplicitRouteType, setRouteType])

  const onMapOpenChange = useCallback((open: boolean) => {
    if (open) {
      setMapOpen(true)
      return
    }
    setMapOpen(false)
  }, [setMapOpen])

  const onCustomGpsChange = useCallback((imageId: string, gps: { latitude: number | null; longitude: number | null }) => {
    setCustomGpsByImageId((prev) => ({ ...prev, [imageId]: gps }))
  }, [setCustomGpsByImageId])

  return {
    toggleImageOrientation,
    handleQuickSwitchImage,
    handleReorderDraftImages,
    setActiveAsDefault,
    handleCopyUnsavedEdits,
    onSelectCrag,
    onCreateCrag,
    onLocationModeChange,
    onRouteTypeChange,
    onMapOpenChange,
    onCustomGpsChange,
  }
}
