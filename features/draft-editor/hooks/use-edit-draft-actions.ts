'use client'

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { csrfFetch } from '@/hooks/useCsrf'
import { serializeDraftMetadataV2, type OrientationDirection } from '@/features/submissions/lib/draft-metadata'
import { normalizeSubmissionCreditHandle } from '@/features/submissions/lib/submission-credit'
import { buildRouteCompletionPayload } from '@/features/route-editor/route-editor-utils'
import type { DraftConflictState } from '@/features/draft-editor/hooks/use-draft-conflict-resolution'
import type { DraftCanvasSource, DraftConflictResponse, DraftPayload, DraftRoute, DraftSavePayload, ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'
import type { SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'

const RATE_LIMIT_ERROR_MESSAGE = 'You are saving too quickly right now. Please wait a moment and try again.'

interface UseEditDraftActionsParams {
  draftId: string
  draft: DraftPayload | null
  draftUpdatedAt: string | null
  currentUserId: string | null
  isOwner: boolean
  routeType: string
  creditPlatform: SubmissionCreditPlatform
  creditHandle: string
  isAnonymousSubmission: boolean
  cragId: string | null
  sectorId: string | null
  canvasSource: DraftCanvasSource | null
  defaultImageId: string | null
  manageImages: ManageImageTab[]
  routesByImageId: Record<string, DraftRoute[]>
  orientationByImageId: Record<string, OrientationDirection[]>
  locationModeByImageId: Record<string, 'shared' | 'custom'>
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null }>
  markerPosition: [number, number] | null
  publishRequirementsRef: RefObject<HTMLDivElement | null>
  cragSectionRef: RefObject<HTMLDivElement | null>
  locationSectionRef: RefObject<HTMLDivElement | null>
  hasPendingUploads: (draftId: string) => boolean
  hasFailedUploads: (draftId: string) => boolean
  hasValidLocation: boolean
  loadDraft: () => Promise<void>
  loadCollaborators: () => Promise<void>
  addToast: (message: string, tone: 'success' | 'error') => void
  setDraft: React.Dispatch<React.SetStateAction<DraftPayload | null>>
  setDraftUpdatedAt: (value: string | null) => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
  setConflict: (value: DraftConflictState | null) => void
  setActiveImageId: (value: string | null | ((current: string | null) => string | null)) => void
}

export function useEditDraftActions({
  draftId,
  draft,
  draftUpdatedAt,
  currentUserId,
  isOwner,
  routeType,
  creditPlatform,
  creditHandle,
  isAnonymousSubmission,
  cragId,
  sectorId,
  canvasSource,
  defaultImageId,
  manageImages,
  routesByImageId,
  orientationByImageId,
  locationModeByImageId,
  customGpsByImageId,
  markerPosition,
  publishRequirementsRef,
  cragSectionRef,
  locationSectionRef,
  hasPendingUploads,
  hasFailedUploads,
  hasValidLocation,
  loadDraft,
  loadCollaborators,
  addToast,
  setDraft,
  setDraftUpdatedAt,
  setError,
  setSuccess,
  setConflict,
  setActiveImageId,
}: UseEditDraftActionsParams) {
  const router = useRouter()
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [publishAttempted, setPublishAttempted] = useState(false)
  const saveInFlightRef = useRef(false)
  const dirtyRoutesRef = useRef<Set<string>>(new Set())
  const hasUnsavedMetadataRef = useRef(false)

  const markRoutesDirty = useCallback((imageIds: string[]) => {
    for (const imageId of imageIds) dirtyRoutesRef.current.add(imageId)
  }, [])

  const markMetadataDirty = useCallback(() => {
    hasUnsavedMetadataRef.current = true
  }, [])

  const syncDraftRoutes = useCallback(async (resolvedRoutesByImageId: Record<string, DraftRoute[]>) => {
    if (!draft?.id) {
      throw new Error('Draft is not ready to save')
    }

    const draftImageIds = new Set((draft.images || []).map((image) => image.id))
    const dirtyImageIds = [...draftImageIds].filter((draftImageId) => dirtyRoutesRef.current.has(draftImageId))
    if (dirtyImageIds.length === 0) return [] as string[]

    const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: dirtyImageIds.map((draftImageId) => ({
          draftImageId,
          routes: resolvedRoutesByImageId[draftImageId] || [],
        })),
      }),
    })
    const payload = await response.json().catch(() => ({ error: 'Failed to sync draft routes' })) as { error?: string }
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to sync draft routes')
    }

    return dirtyImageIds
  }, [draft])

  const getImagesMissingRoutes = useCallback((resolvedRoutesByImageId: Record<string, DraftRoute[]>) => {
    return manageImages
      .filter((image) => image.sourceKind === 'draft-image')
      .filter((image) => (resolvedRoutesByImageId[image.imageId] || []).length === 0)
  }, [manageImages])

  const buildSavePayload = useCallback((resolvedRoutesByImageId: Record<string, DraftRoute[]>, resolvedCragId: string | null) => {
    const nextImagesPayload = buildRouteCompletionPayload(draft?.images || [], resolvedRoutesByImageId, routeType, manageImages.map((image) => image.imageId))
    const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
    if (creditHandle.trim().length > 0 && !normalizedHandle) {
      throw new Error('Invalid credit handle format')
    }

    const fullV2Metadata = serializeDraftMetadataV2({
      version: 2,
      navigation: { defaultImageId },
      images: nextImagesPayload.reduce<Record<string, { imageId: string; displayOrder: number; orientation?: OrientationDirection[]; locationMode: 'shared' | 'custom'; gps: { latitude: number | null; longitude: number | null } }>>((acc, image) => {
        acc[image.id] = {
          imageId: image.id,
          displayOrder: image.display_order,
          orientation: orientationByImageId[image.id] || [],
          locationMode: locationModeByImageId[image.id] === 'custom' ? 'custom' : 'shared',
          gps: {
            latitude: customGpsByImageId[image.id]?.latitude ?? null,
            longitude: customGpsByImageId[image.id]?.longitude ?? null,
          },
        }
        return acc
      }, {}),
      submission: {
        routeType,
        location: {
          latitude: markerPosition ? markerPosition[0] : null,
          longitude: markerPosition ? markerPosition[1] : null,
        },
        isAnonymousSubmission,
        contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
        contributionCreditHandle: normalizedHandle,
        sectorId,
        canvasSource: canvasSource?.kind === 'crag-image'
          ? { kind: 'crag-image', cragImageId: canvasSource.cragImageId, cragId: canvasSource.cragId }
          : canvasSource?.kind === 'draft-image'
            ? { kind: 'draft-image', draftImageId: canvasSource.draftImageId }
            : null,
      },
    })

    return {
      savePayload: {
        images: nextImagesPayload,
        cragId: resolvedCragId,
        metadata: fullV2Metadata,
      } satisfies DraftSavePayload,
      fullV2Metadata,
    }
  }, [canvasSource, creditHandle, creditPlatform, customGpsByImageId, defaultImageId, draft?.images, isAnonymousSubmission, locationModeByImageId, manageImages, markerPosition, orientationByImageId, routeType, sectorId])

  const publishValidationMessage = useMemo(() => {
    const missingItems: string[] = []
    const imagesMissingRoutes = getImagesMissingRoutes(routesByImageId)

    if (draftId && hasPendingUploads(draftId)) {
      missingItems.push('wait for photo uploads to finish')
    }

    if (draftId && hasFailedUploads(draftId)) {
      missingItems.push('retry or delete failed photo uploads')
    }

    if (!cragId) {
      missingItems.push('select a crag')
    }

    if (!hasValidLocation) {
      missingItems.push('add climb location')
    }

    if (imagesMissingRoutes.length > 0) {
      missingItems.push('draw at least one route on every image or remove the images without routes')
    }

    return missingItems.length > 0 ? `Before publishing, ${missingItems.join(', ')}.` : null
  }, [cragId, draftId, getImagesMissingRoutes, hasFailedUploads, hasPendingUploads, hasValidLocation, routesByImageId])

  const saveDraft = useCallback(async (options?: { overrideRoutesByImageId?: Record<string, DraftRoute[]>; overrideCragId?: string | null }) => {
    const resolvedRoutesByImageId = options?.overrideRoutesByImageId ?? routesByImageId
    const resolvedCragId = options?.overrideCragId ?? cragId
    if (!draft || !draftUpdatedAt) return false
    if (saveInFlightRef.current) return false
    if (dirtyRoutesRef.current.size === 0 && !hasUnsavedMetadataRef.current && !options?.overrideCragId) return true

    saveInFlightRef.current = true
    setSavingDraft(true)
    setError(null)
    setSuccess(null)

    try {
      const syncedImageIds = await syncDraftRoutes(resolvedRoutesByImageId)
      const { savePayload, fullV2Metadata } = buildSavePayload(resolvedRoutesByImageId, resolvedCragId)
      let expectedUpdatedAt = draftUpdatedAt
      let payload: {
        error?: string
        code?: string
        draft?: { updated_at?: string }
        current_updated_at?: string
        current_data?: { last_updated_by?: string | null; last_updated_by_display_name?: string | null }
      } = {}

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await csrfFetch(`/api/submissions/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...savePayload,
            expected_updated_at: expectedUpdatedAt,
          }),
        })

        const resultPayload = await response.json().catch(() => ({ error: 'Failed to save draft' })) as typeof payload
        const result = {
          success: response.ok,
          status: response.status,
          error: resultPayload.error,
        }

        payload = resultPayload

        if (result.success) break
        if (result.status === 409 && payload.code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          const isSelfConflict = conflictPayload.current_data?.last_updated_by === currentUserId
          if (isSelfConflict && attempt === 0) {
            expectedUpdatedAt = conflictPayload.current_updated_at
            setDraftUpdatedAt(conflictPayload.current_updated_at)
            continue
          }
          if (!isSelfConflict) {
            setConflict({
              serverUpdatedAt: conflictPayload.current_updated_at,
              lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
              pendingChanges: savePayload,
            })
            return false
          }
        }
        throw new Error(result.status === 429 ? RATE_LIMIT_ERROR_MESSAGE : (result.error || payload.error || 'Failed to save draft'))
      }

      if (!payload.draft) {
        throw new Error(payload.error || 'Failed to save draft')
      }

      setDraft((prev) => prev ? {
        ...prev,
        updated_at: payload.draft?.updated_at || prev.updated_at,
        last_edited_by: currentUserId,
        metadata: { ...fullV2Metadata },
      } : prev)
      setDraftUpdatedAt(payload.draft?.updated_at || new Date().toISOString())
      for (const imageId of syncedImageIds) dirtyRoutesRef.current.delete(imageId)
      hasUnsavedMetadataRef.current = false
      setConflict(null)
      setSuccess('Draft saved. Not published to the map.')
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      return false
    } finally {
      saveInFlightRef.current = false
      setSavingDraft(false)
    }
  }, [buildSavePayload, cragId, currentUserId, draft, draftUpdatedAt, routesByImageId, setConflict, setDraft, setDraftUpdatedAt, setError, setSuccess, syncDraftRoutes])

  const handleDeleteDraft = useCallback(async () => {
    if (!draftId || !isOwner) return

    setError(null)
    const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
      method: 'DELETE',
    })
    const payload = await response.json().catch(() => ({ error: 'Failed to delete draft' })) as { error?: string }
    if (!response.ok) {
      setError(payload.error || 'Failed to delete draft')
      return
    }

    addToast('Draft deleted', 'success')
    router.push('/logbook')
  }, [addToast, draftId, isOwner, router, setError])

  const persistMetadataImmediately = useCallback((applyChange: () => void) => {
    applyChange()
    markMetadataDirty()
  }, [markMetadataDirty])

  const handleManualSave = useCallback(() => {
    void saveDraft()
  }, [saveDraft])

  const publishDraft = useCallback(async () => {
    if (!draft || !isOwner) return

    if (publishValidationMessage) {
      setPublishAttempted(true)
      setError(null)

      if (!cragId) {
        cragSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (!hasValidLocation) {
        locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      const imagesMissingRoutes = getImagesMissingRoutes(routesByImageId)
      if (imagesMissingRoutes.length > 0) {
        const firstMissingImage = imagesMissingRoutes[0] || null
        if (firstMissingImage) {
          setActiveImageId(firstMissingImage.imageId)
        }
        publishRequirementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    setPublishAttempted(false)

    setPublishingDraft(true)
    setError(null)

    try {
      const saved = await saveDraft()
      if (!saved) return

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/publish`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({ error: 'Failed to publish draft' })) as {
        error?: string
        published?: {
          defaultImageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
          canonicalPath?: string
          defaultRouteId?: string | null
        }
      }

      if (!response.ok || !payload.published?.defaultImageId || !payload.published.canonicalPath) {
        throw new Error(payload.error || 'Failed to publish draft')
      }

      const imageCount = Array.isArray(payload.published.imageIds) ? payload.published.imageIds.length : 1
      const routeCount = Array.isArray(payload.published.routeLineIds) ? payload.published.routeLineIds.length : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} image${imageCount === 1 ? '' : 's'}.`, 'success')

      const query = new URLSearchParams({
        publishedImages: String(imageCount),
        publishedRoutes: String(routeCount),
      })
      if (payload.published.defaultRouteId) {
        query.set('route', payload.published.defaultRouteId)
      }
      router.push(`${payload.published.canonicalPath}?${query.toString()}`)
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : 'Failed to publish draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setPublishingDraft(false)
    }
  }, [addToast, cragId, draft, getImagesMissingRoutes, hasValidLocation, isOwner, locationSectionRef, publishRequirementsRef, publishValidationMessage, router, routesByImageId, saveDraft, setActiveImageId, setError, cragSectionRef])

  const handleReloadLatestDraft = useCallback(async () => {
    setConflict(null)
    setSuccess(null)
    await loadDraft()
    await loadCollaborators()
  }, [loadCollaborators, loadDraft, setConflict, setSuccess])

  return {
    savingDraft,
    publishingDraft,
    publishAttempted,
    publishValidationMessage,
    markMetadataDirty,
    markRoutesDirty,
    saveDraft,
    handleDeleteDraft,
    persistMetadataImmediately,
    handleManualSave,
    publishDraft,
    handleReloadLatestDraft,
  }
}
