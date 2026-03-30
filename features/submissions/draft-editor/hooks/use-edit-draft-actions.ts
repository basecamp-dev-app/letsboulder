'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { serializeDraftMetadataV2, type OrientationDirection } from '@/features/submissions/lib/draft-metadata'
import { normalizeSubmissionCreditHandle } from '@/features/submissions/lib/submission-credit'
import { buildRouteCompletionPayload, buildRouteWorkflowSignature } from '@/features/route-editor/route-editor-utils'
import { csrfFetch } from '@/hooks/useCsrf'
import type { DraftConflictState } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import type { DraftCanvasSource, DraftConflictResponse, DraftPayload, DraftRoute, DraftSavePayload, ManageImageTab } from '@/features/submissions/draft-editor/lib/edit-draft-types'
import type { SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'

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
  imagesPayloadSignature: string
  autosavePausedRef: MutableRefObject<boolean>
  autosavePausedSnapshotRef: MutableRefObject<string>
  hasLoadedRoutesRef: MutableRefObject<boolean>
  lastPersistedRoutesRef: MutableRefObject<string>
  publishRequirementsRef: RefObject<HTMLDivElement | null>
  cragSectionRef: RefObject<HTMLDivElement | null>
  locationSectionRef: RefObject<HTMLDivElement | null>
  hasInFlightDraftUploads: boolean
  hasPendingUploads: (draftId: string) => boolean
  hasFailedUploads: (draftId: string) => boolean
  isInitialLoading: boolean
  conflict: DraftConflictState | null
  defaultImageTab: ManageImageTab | null
  defaultImageRoutesLength: number
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
  imagesPayloadSignature,
  autosavePausedRef,
  autosavePausedSnapshotRef,
  hasLoadedRoutesRef,
  lastPersistedRoutesRef,
  publishRequirementsRef,
  cragSectionRef,
  locationSectionRef,
  hasInFlightDraftUploads,
  hasPendingUploads,
  hasFailedUploads,
  isInitialLoading,
  conflict,
  defaultImageTab,
  defaultImageRoutesLength,
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
  const autosaveTimeoutRef = useRef<number | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'pending' | 'saving' | 'syncing' | 'saved'>('idle')
  const [publishAttempted, setPublishAttempted] = useState(false)

  const autosaveSignature = useMemo(() => buildRouteWorkflowSignature({
    imagesPayloadSignature,
    defaultImageId,
    routeType,
    markerLatitude: markerPosition ? markerPosition[0] : null,
    markerLongitude: markerPosition ? markerPosition[1] : null,
    cragId,
    isAnonymousSubmission,
    creditPlatform,
    creditHandle,
    sectorId,
    canvasSource,
    orientationByImageId,
    locationModeByImageId,
    customGpsByImageId,
  }), [canvasSource, creditHandle, creditPlatform, cragId, customGpsByImageId, defaultImageId, imagesPayloadSignature, isAnonymousSubmission, locationModeByImageId, markerPosition, orientationByImageId, routeType, sectorId])

  const publishValidationMessage = useMemo(() => {
    const missingItems: string[] = []

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

    if (!defaultImageTab || defaultImageRoutesLength === 0) {
      missingItems.push(`draw at least one route on ${defaultImageTab?.label || 'the default image'}`)
    }

    return missingItems.length > 0 ? `Before publishing, ${missingItems.join(', ')}.` : null
  }, [cragId, defaultImageRoutesLength, defaultImageTab, draftId, hasFailedUploads, hasPendingUploads, hasValidLocation])

  const saveDraft = useCallback(async (options?: { silent?: boolean; overrideRoutesByImageId?: Record<string, DraftRoute[]>; overrideCragId?: string | null }) => {
    const silent = options?.silent === true
    const resolvedRoutesByImageId = options?.overrideRoutesByImageId ?? routesByImageId
    const resolvedCragId = options?.overrideCragId ?? cragId
    if (!draft || !draftUpdatedAt) return false

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setSavingDraft(true)
    if (silent) {
      setAutosaveState('saving')
    } else {
      setError(null)
      setSuccess(null)
    }

    try {
      const nextImagesPayload = buildRouteCompletionPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages.map((image) => image.imageId))
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

      const savePayload: DraftSavePayload = {
        images: nextImagesPayload,
        cragId: resolvedCragId,
        metadata: fullV2Metadata as unknown as Record<string, unknown>,
      }

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...savePayload, expected_updated_at: draftUpdatedAt }),
      })

      const payload = await response.json().catch(() => ({} as {
        error?: string
        code?: string
        draft?: { updated_at?: string }
        current_updated_at?: string
        current_data?: { last_updated_by?: string | null; last_updated_by_display_name?: string | null }
      }))

      if (!response.ok) {
        if (response.status === 409 && payload.code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          const isSelfConflict = conflictPayload.current_data?.last_updated_by === currentUserId
          if (silent || isSelfConflict) {
            if (autosaveTimeoutRef.current) {
              window.clearTimeout(autosaveTimeoutRef.current)
              autosaveTimeoutRef.current = null
            }
            setDraftUpdatedAt(conflictPayload.current_updated_at)
            if (silent) {
              setAutosaveState('syncing')
              if (!isSelfConflict) {
                autosavePausedRef.current = true
                autosavePausedSnapshotRef.current = buildRouteWorkflowSignature({
                  imagesPayloadSignature: JSON.stringify(buildRouteCompletionPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages.map((image) => image.imageId))),
                  defaultImageId,
                  routeType,
                  markerLatitude: markerPosition ? markerPosition[0] : null,
                  markerLongitude: markerPosition ? markerPosition[1] : null,
                  cragId: resolvedCragId,
                  isAnonymousSubmission,
                  creditPlatform,
                  creditHandle: normalizedHandle,
                  sectorId,
                  canvasSource,
                  orientationByImageId,
                  locationModeByImageId,
                  customGpsByImageId,
                })
              }
            } else {
              setAutosaveState('idle')
            }
            return false
          }
          setConflict({
            serverUpdatedAt: conflictPayload.current_updated_at,
            lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: savePayload,
          })
          return false
        }
        throw new Error(payload.error || 'Failed to save draft')
      }

      setDraft((prev) => prev ? {
        ...prev,
        updated_at: payload.draft?.updated_at || prev.updated_at,
        last_edited_by: currentUserId,
        metadata: { ...fullV2Metadata },
      } : prev)
      setDraftUpdatedAt(payload.draft?.updated_at || new Date().toISOString())
      lastPersistedRoutesRef.current = buildRouteWorkflowSignature({
        imagesPayloadSignature: JSON.stringify(savePayload.images),
        defaultImageId,
        routeType,
        markerLatitude: markerPosition ? markerPosition[0] : null,
        markerLongitude: markerPosition ? markerPosition[1] : null,
        cragId: resolvedCragId,
        isAnonymousSubmission,
        creditPlatform,
        creditHandle: normalizedHandle,
        sectorId,
        canvasSource,
        orientationByImageId,
        locationModeByImageId,
        customGpsByImageId,
      })
      setConflict(null)
      if (silent) {
        setAutosaveState('saved')
      } else {
        setAutosaveState('idle')
        setSuccess('Draft saved. Not published to the map.')
      }
      return true
    } catch (saveError) {
      setAutosaveState('idle')
      if (!silent) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      }
      return false
    } finally {
      setSavingDraft(false)
    }
  }, [canvasSource, cragId, creditHandle, creditPlatform, currentUserId, customGpsByImageId, defaultImageId, draft, draftUpdatedAt, isAnonymousSubmission, locationModeByImageId, manageImages, markerPosition, orientationByImageId, routeType, routesByImageId, sectorId, setConflict, setDraft, setDraftUpdatedAt, setError, setSuccess, autosavePausedRef, autosavePausedSnapshotRef, lastPersistedRoutesRef])

  const handleDeleteDraft = useCallback(async () => {
    if (!draftId || !isOwner) return

    setError(null)
    const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({} as { error?: string }))
    if (!response.ok) {
      setError(payload.error || 'Failed to delete draft')
      return
    }

    addToast('Draft deleted', 'success')
    router.push('/logbook')
  }, [addToast, draftId, isOwner, router, setError])

  const persistMetadataImmediately = useCallback((applyChange: () => void) => {
    applyChange()

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setAutosaveState('saving')
    window.setTimeout(() => {
      void saveDraft({ silent: true })
    }, 0)
  }, [saveDraft])

  const handleManualSave = useCallback(() => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }
    void saveDraft()
  }, [saveDraft])

  useEffect(() => {
    if (!hasLoadedRoutesRef.current) return
    if (!draft || !draftUpdatedAt) return
    if (isInitialLoading || publishingDraft || savingDraft || !!conflict) return
    if (hasInFlightDraftUploads) return

    if (autosavePausedRef.current) {
      if (autosaveSignature === autosavePausedSnapshotRef.current) {
        return
      }
      autosavePausedRef.current = false
      autosavePausedSnapshotRef.current = ''
    }

    if (autosaveSignature === lastPersistedRoutesRef.current) {
      if (autosaveState === 'pending' || autosaveState === 'syncing') {
        setAutosaveState('idle')
      }
      return
    }

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    setAutosaveState('pending')
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null
      void saveDraft({ silent: true })
    }, 1000)

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [autosaveSignature, autosaveState, conflict, draft, draftUpdatedAt, hasInFlightDraftUploads, isInitialLoading, lastPersistedRoutesRef, publishingDraft, saveDraft, savingDraft, autosavePausedRef, autosavePausedSnapshotRef, hasLoadedRoutesRef])

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [])

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

      if (!defaultImageTab || defaultImageRoutesLength === 0) {
        if (defaultImageTab) {
          setActiveImageId(defaultImageTab.imageId)
        }
        publishRequirementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    setPublishAttempted(false)

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setPublishingDraft(true)
    setError(null)

    try {
      const saved = await saveDraft()
      if (!saved) return

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/promote`, { method: 'POST' })
      const payload = await response.json().catch(() => ({} as {
        error?: string
        published?: {
          defaultImageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
          canonicalPath?: string
          defaultRouteId?: string | null
        }
      }))

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
  }, [addToast, cragId, defaultImageRoutesLength, defaultImageTab, draft, hasValidLocation, isOwner, locationSectionRef, publishRequirementsRef, publishValidationMessage, router, saveDraft, setActiveImageId, setError, cragSectionRef])

  const handleReloadLatestDraft = useCallback(async () => {
    setConflict(null)
    setSuccess(null)
    await loadDraft()
    await loadCollaborators()
  }, [loadCollaborators, loadDraft, setConflict, setSuccess])

  return {
    autosaveState,
    setAutosaveState,
    savingDraft,
    publishingDraft,
    publishAttempted,
    publishValidationMessage,
    saveDraft,
    handleDeleteDraft,
    persistMetadataImmediately,
    handleManualSave,
    publishDraft,
    handleReloadLatestDraft,
  }
}
