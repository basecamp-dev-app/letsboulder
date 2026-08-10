'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useQueryClient } from '@tanstack/react-query'
import {
  applyPublishedSubmissionEditAction,
} from '@/features/submissions/actions/editor-write-actions'
import {
  updateSubmissionAnonymousAction,
  updateSubmissionCreditAction,
} from '@/features/submissions/actions/submission-metadata-actions'
import { useAtlasAutoSync } from '@/features/submissions/editor/location/use-atlas-auto-sync'
import { areSerializedRoutesEqual } from '@/features/route-editor/route-editor-utils'
import { ToastContainer, useToast } from '@/features/logbook/components/Toast'
import type { UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { useRouteStore } from '@/features/route-editor/store'
import { serializeStoredRoutes } from '@/features/submissions/lib/route-store-sync'
import type { RouteLine } from '@/types/domain'
import { SubmissionWorkstation } from '@/features/submissions/components/SubmissionWorkstation'
import { SubmissionDetailsPanel } from '@/features/submissions/submission-editor/components/SubmissionDetailsPanel'
import { SubmissionToolbar } from '@/features/submissions/submission-editor/components/SubmissionToolbar'
import { SubmissionLocationPanel } from '@/features/submissions/submission-editor/components/SubmissionLocationPanel'
import { useSubmissionEditorData } from '@/features/submissions/submission-editor/hooks/use-submission-editor-data'
import { useSubmissionLocationMetadata } from '@/features/submissions/editor/location/use-submission-location-metadata'
import {
  applyPublishedRouteIdMappings,
} from '@/features/submissions/submission-editor/lib/published-route-editor-state'
import { usePublishedRouteEditorSync } from '@/features/submissions/submission-editor/hooks/use-published-route-editor-sync'
import { useUnsavedChangesWarning } from '@/features/editor/hooks/use-unsaved-changes-warning'
import { useOpenDataConsent } from '@/features/legal/hooks/use-open-data-consent'
import { OpenDataLicenseNotice } from '@/features/legal/components/OpenDataLicenseNotice'
import { invalidateCragQueries } from '@/features/crags/lib/invalidate-crag-queries'

export default function EditSubmittedRoutesPage() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { toasts, removeToast } = useToast()
  const { requireConsent } = useOpenDataConsent()
  const editor = useSubmissionEditorData()
  const location = useSubmissionLocationMetadata({ currentUserId: editor.currentUserId, ownerUserId: editor.ownerUserId, cragId: editor.cragId, initialLatitude: editor.initialLatitude, initialLongitude: editor.initialLongitude, initialCragName: editor.initialCragName, initialRegionTag: editor.initialRegionTag, initialSubArea: editor.initialSubArea, initialFaceDirections: editor.initialFaceDirections, initialLocationMode: editor.initialLocationMode })
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef | null>(null)
  const pendingMutationRef = useRef<{ id: string; operations: string } | null>(null)
  const [savingAllChanges, setSavingAllChanges] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [orientationOpen, setOrientationOpen] = useState(true)
  const atlasSync = useAtlasAutoSync(editor.markerPosition?.[0] ?? null, editor.markerPosition?.[1] ?? null)
  const {
    selectedRouteId,
    setSelectedRoute,
    setActiveRoute,
    setEditorPanelOpen,
    currentPointsCount,
    interactionTool,
    undoLastPoint,
    setInteractionTool,
    setRoutes,
    routes: routeStoreRoutes,
  } = useRouteStore(useShallow((state) => ({
    selectedRouteId: state.selectedRouteId,
    setSelectedRoute: state.setSelectedRoute,
    setActiveRoute: state.setActiveRoute,
    setEditorPanelOpen: state.setEditorPanelOpen,
    currentPointsCount: state.currentPoints.length,
    interactionTool: state.interactionTool,
    undoLastPoint: state.undoLastPoint,
    setInteractionTool: state.setInteractionTool,
    setRoutes: state.setRoutes,
    routes: state.routes,
  })))
  const requestedRouteId = searchParams.get('route')
  const hasPendingChanges = location.imageMetadataDirty
    || editor.creditDirty
    || editor.anonymityDirty
    || !areSerializedRoutesEqual(
      serializeStoredRoutes(editor.editedRoutes),
      serializeStoredRoutes(editor.initialEditedRoutes)
    )
  useUnsavedChangesWarning(hasPendingChanges)
  const { commitRoutes } = usePublishedRouteEditorSync({
    activeImageId: editor.activeImageId,
    editedRoutes: editor.editedRoutes,
    setEditedRoutes: editor.setEditedRoutes,
  })
  const syncLocationFromEditor = useCallback(() => {
    location.setLatitude(editor.latitude)
    location.setLongitude(editor.longitude)
    location.setCragName(editor.cragName)
    location.setRegionTag(editor.regionTag)
    location.setSubArea(editor.subArea)
    location.setFaceDirections(editor.faceDirections)
    location.setLocationMode(editor.locationMode)
    location.setInitialLatitude(editor.initialLatitude)
    location.setInitialLongitude(editor.initialLongitude)
    location.setInitialCragName(editor.initialCragName)
    location.setInitialRegionTag(editor.initialRegionTag)
    location.setInitialSubArea(editor.initialSubArea)
    location.setInitialFaceDirections(editor.initialFaceDirections)
    location.setInitialLocationMode(editor.initialLocationMode)
  }, [editor, location])

  useEffect(() => {
    syncLocationFromEditor()
  }, [syncLocationFromEditor])

  useEffect(() => {
    if (!requestedRouteId || editor.editedRoutes.length === 0) return

    const matchedRoute = editor.editedRoutes.find((route) => route.id === requestedRouteId || route.climb_id === requestedRouteId || route.climb?.id === requestedRouteId)
    if (!matchedRoute) return

    setSelectedRoute(matchedRoute.id)
    setActiveRoute(matchedRoute.id)
    setEditorPanelOpen(true)
  }, [editor.editedRoutes, requestedRouteId, setActiveRoute, setEditorPanelOpen, setSelectedRoute])

  const handleSelectImage = useCallback((imageId: string) => {
    commitRoutes()
    editor.handleQuickSwitchImage(imageId)
  }, [commitRoutes, editor])

  const saveAllChangesAfterConsent = useCallback(async () => {
    if (savingAllChanges || !editor.activeImageId) return
    const editedRoutes = commitRoutes() ?? editor.editedRoutes
    setSavingAllChanges(true)
    editor.setError(null)
    editor.setSuccess(null)

    try {
      const latitude = location.latitude.trim() === '' ? null : Number(location.latitude)
      const longitude = location.longitude.trim() === '' ? null : Number(location.longitude)
      if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
        throw new Error('Latitude and longitude must be valid numbers')
      }

      const imageMetadataChanged = location.imageMetadataDirty
      const newRoutes = editedRoutes.filter(
        (route) => !route.climb_id || route.created_at === 'draft-created'
      )
      const existingRoutes = editedRoutes.filter(
        (route) => route.climb_id && route.created_at !== 'draft-created'
      )

      const routesChanged = !areSerializedRoutesEqual(
        serializeStoredRoutes(editedRoutes),
        serializeStoredRoutes(editor.initialEditedRoutes)
      )
      const initialGradeByRouteId = new Map(
        editor.initialEditedRoutes.map((route) => [route.id, route.climb?.grade])
      )
      const gradeVotes = existingRoutes
        .filter((route) => route.id && route.climb?.grade && route.climb.grade !== initialGradeByRouteId.get(route.id))
        .map((route) => ({ routeLineId: route.id, grade: route.climb?.grade || '6A' }))
      const operations = {
        baseRevision: editor.wikiRevision,
        ...(imageMetadataChanged ? {
          imageMetadata: {
            latitude,
            longitude,
            faceDirections: location.faceDirections,
            locationMode: location.locationMode,
          },
        } : {}),
        createRoutes: newRoutes.map((route) => ({
          clientRouteId: route.id,
          name: route.climb?.name || 'Unnamed',
          grade: route.climb?.grade || '6A',
          climbType: ['sport', 'boulder', 'trad', 'deep-water-solo'].includes(route.climb?.route_type || '')
            ? route.climb?.route_type
            : 'boulder',
          description: route.climb?.description ?? null,
          points: route.points,
          sequenceOrder: route.sequence_order,
          imageWidth: Math.round(route.image_width || 1600),
          imageHeight: Math.round(route.image_height || 1200),
        })),
        updateRoutes: routesChanged ? existingRoutes.map((route) => ({
          routeLineId: route.id,
          name: route.climb?.name || 'Unnamed',
          description: route.climb?.description ?? null,
          points: route.points,
          sequenceOrder: route.sequence_order,
        })) : [],
        gradeVotes,
      }
      const hasCoreChanges = imageMetadataChanged || newRoutes.length > 0 || routesChanged || gradeVotes.length > 0
      let reconciledRoutes = editedRoutes

      if (hasCoreChanges) {
        const serializedOperations = JSON.stringify(operations)
        if (!pendingMutationRef.current || pendingMutationRef.current.operations !== serializedOperations) {
          pendingMutationRef.current = { id: crypto.randomUUID(), operations: serializedOperations }
        }
        const result = await applyPublishedSubmissionEditAction(
          editor.activeImageId,
          pendingMutationRef.current.id,
          operations
        )
        if (!result.success || !result.data) throw new Error(result.error || 'Failed to save submission changes')
        if (editor.cragId) await invalidateCragQueries(queryClient, editor.cragId)

        reconciledRoutes = applyPublishedRouteIdMappings(editedRoutes, result.data.routeMappings, editor.activeImageId)
        editor.setEditedRoutes(reconciledRoutes)
        setRoutes(reconciledRoutes)
        editor.setInitialEditedRoutes(reconciledRoutes)
        editor.setWikiRevision(result.data.revision)
        if (imageMetadataChanged) {
          location.setInitialLatitude(location.latitude)
          location.setInitialLongitude(location.longitude)
          location.setInitialFaceDirections(location.faceDirections)
          location.setInitialLocationMode(location.locationMode)
        }
        pendingMutationRef.current = null
      }

      if (editor.creditDirty) {
        const creditResult = await updateSubmissionCreditAction(editor.activeImageId, editor.creditPlatform, editor.creditHandle)
        if (!creditResult.success) throw new Error(creditResult.error || 'Failed to save contribution credit')
      }
      if (editor.anonymityDirty) {
        const anonymousResult = await updateSubmissionAnonymousAction(editor.activeImageId, editor.isAnonymousSubmission)
        if (!anonymousResult.success) throw new Error(anonymousResult.error || 'Failed to save anonymity')
      }
      location.setInitialLatitude(location.latitude)
      location.setInitialLongitude(location.longitude)
      location.setInitialFaceDirections(location.faceDirections)
      location.setInitialLocationMode(location.locationMode)
      editor.setInitialCreditPlatform(editor.creditPlatform)
      editor.setInitialCreditHandle(editor.creditHandle)
      editor.setInitialIsAnonymousSubmission(editor.isAnonymousSubmission)

      editor.setSuccess('Submission changes saved')
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : 'Failed to save submission changes')
    } finally {
      setSavingAllChanges(false)
    }
  }, [commitRoutes, editor, location, queryClient, savingAllChanges, setRoutes])

  const handleSaveAllChanges = useCallback(() => {
    void requireConsent(saveAllChangesAfterConsent)
  }, [requireConsent, saveAllChangesAfterConsent])

  if (editor.loading) {
    return <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" /></div>
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <SubmissionToolbar hasPendingChanges={hasPendingChanges} savingAllChanges={savingAllChanges} onSaveAllChanges={() => { void handleSaveAllChanges() }} />
        <OpenDataLicenseNotice context="edit" className="mb-3" />
        {editor.error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{editor.error}</div> : null}
        {editor.success ? <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">{editor.success}</div> : null}
        <SubmissionLocationPanel atlasSync={atlasSync} canProposeCragMetadata={!!editor.currentUserId && !!editor.cragId} cragId={editor.cragId} sourceImageId={editor.activeImageId} cragName={location.cragName} regionTag={location.regionTag} subArea={location.subArea} onProposalSubmitted={() => editor.setSuccess('Crag details proposal submitted for review')} latitude={location.latitude} onLatitudeChange={(value) => { location.setLatitude(value); editor.setLatitude(value) }} longitude={location.longitude} onLongitudeChange={(value) => { location.setLongitude(value); editor.setLongitude(value) }} searchQuery={location.searchQuery} onSearchQueryChange={location.setSearchQuery} onSearchLocation={() => { void location.handleSearchLocation() }} searchingLocation={location.searchingLocation} locationSearchError={location.locationSearchError} />
        {editor.hasReadyData && editor.activeImageUrl ? <SubmissionWorkstation drawingAreaRef={drawingAreaRef} routeCanvasRef={routeCanvasRef} quickSwitcherImages={editor.quickSwitcherImages} activeImageId={editor.activeImageId} activeImageUrl={editor.activeImageUrl} draftPins={editor.publishedDraftPins} publishedPins={[]} initialCenter={editor.markerPosition} onSelectImage={handleSelectImage} existingRouteLines={routeStoreRoutes} allowDelete={false} selectedRouteId={selectedRouteId} onSelectRoute={(routeId) => { setSelectedRoute(routeId); setActiveRoute(routeId); setEditorPanelOpen(true) }} onReorderRoutes={(routeIds) => { const reordered = routeIds.map((routeId, index) => { const route = routeStoreRoutes.find((item) => item.id === routeId); return route ? { ...route, sequence_order: index } : null }).filter((route): route is RouteLine => route !== null); setRoutes(reordered) }} interactionTool={interactionTool === 'select' ? 'select' : 'draw'} currentPointsCount={currentPointsCount} onSetSelectTool={() => { setInteractionTool('select'); setEditorPanelOpen(true) }} onSetDrawTool={() => { setInteractionTool('draw'); setEditorPanelOpen(false) }} onUndoPoint={() => undoLastPoint()} onFinishRoute={() => routeCanvasRef.current?.finishRoute()} canvasKey={`${editor.canvasKey}:${editor.activeImageId}`} extraAction={null} /> : null}
        <SubmissionDetailsPanel detailsOpen={detailsOpen} onDetailsToggle={() => setDetailsOpen((open) => !open)} orientationOpen={orientationOpen} onOrientationToggle={() => setOrientationOpen((open) => !open)} faceDirections={location.faceDirections} onToggleFaceDirection={(direction) => { location.toggleFaceDirection(direction); editor.toggleFaceDirection(direction) }} owner={editor.owner} contributors={editor.contributors} history={editor.history} canEditCredit={editor.canEditContributionCredit} isAnonymous={editor.isAnonymousSubmission} onAnonymousChange={editor.setIsAnonymousSubmission} creditPlatform={editor.creditPlatform} onCreditPlatformChange={editor.setCreditPlatform} creditHandle={editor.creditHandle} onCreditHandleChange={editor.setCreditHandle} />
      </div>
    </div>
  )
}
