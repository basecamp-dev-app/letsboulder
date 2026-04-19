'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  createPublishedSubmissionRoutesAction,
  updatePublishedSubmissionRoutesAction,
  updateSubmissionImageMetadataAction,
} from '@/features/submissions/actions/editor-write-actions'
import {
  saveSubmissionGradeVotesAction,
  updateSubmissionAnonymousAction,
  updateSubmissionCragAction,
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
  normalizePublishedRoute,
  replaceDraftRoutesWithPublishedRoutes,
} from '@/features/submissions/submission-editor/lib/published-route-editor-state'
import { usePublishedRouteEditorSync } from '@/features/submissions/submission-editor/hooks/use-published-route-editor-sync'

interface CreatedPublishedRoutePayload {
  id: string
  climb_id: string
  points: RouteLine['points']
  sequence_order: number
  image_width: number | null
  image_height: number | null
  climbs: {
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
  } | Array<{
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
  }> | null
}

function readCreatedRoutesPayload(data: unknown): CreatedPublishedRoutePayload[] {
  if (!data || typeof data !== 'object' || !('routes' in data)) return []
  const routes = (data as { routes?: unknown }).routes
  return Array.isArray(routes) ? routes as CreatedPublishedRoutePayload[] : []
}

export default function EditSubmittedRoutesPage() {
  const searchParams = useSearchParams()
  const { toasts, removeToast } = useToast()
  const editor = useSubmissionEditorData()
  const location = useSubmissionLocationMetadata({ currentUserId: editor.currentUserId, ownerUserId: editor.ownerUserId, cragId: editor.cragId, initialLatitude: editor.initialLatitude, initialLongitude: editor.initialLongitude, initialCragName: editor.initialCragName, initialRegionTag: editor.initialRegionTag, initialSubArea: editor.initialSubArea, initialFaceDirections: editor.initialFaceDirections, initialLocationMode: editor.initialLocationMode })
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef | null>(null)
  const [savingAllChanges, setSavingAllChanges] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [orientationOpen, setOrientationOpen] = useState(true)
  const atlasSync = useAtlasAutoSync(editor.markerPosition?.[0] ?? null, editor.markerPosition?.[1] ?? null)
  const {
    selectedRouteId,
    setSelectedRoute,
    setActiveRoute,
    setEditorPanelOpen,
    currentPoints,
    interactionTool,
    undoLastPoint,
    setInteractionTool,
    setRoutes,
  } = useRouteStore()
  const requestedRouteId = searchParams.get('route')
  usePublishedRouteEditorSync({
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

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    editor.setEditedRoutes(routes)
  }, [editor])

  const handleSaveAllChanges = useCallback(async () => {
    if (savingAllChanges || !editor.activeImageId) return
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
      const creditChanged = editor.creditDirty || editor.anonymityDirty
      if (imageMetadataChanged || creditChanged) {
        const result = await updateSubmissionImageMetadataAction(editor.activeImageId, {
          latitude,
          longitude,
          faceDirections: location.faceDirections,
          locationMode: location.locationMode,
        })
        if (!result.success) throw new Error(result.error || 'Failed to save image metadata')

        if (editor.creditDirty) {
          const creditResult = await updateSubmissionCreditAction(editor.activeImageId, editor.creditPlatform, editor.creditHandle)
          if (!creditResult.success) throw new Error(creditResult.error || 'Failed to save contribution credit')
        }

        if (editor.anonymityDirty) {
          const anonymousResult = await updateSubmissionAnonymousAction(editor.activeImageId, editor.isAnonymousSubmission)
          if (!anonymousResult.success) throw new Error(anonymousResult.error || 'Failed to save anonymity')
        }
      }

      if (location.cragMetadataDirty && editor.cragId && location.canEditCragMetadata) {
        const cragResult = await updateSubmissionCragAction(
          editor.activeImageId,
          location.cragName,
          location.regionTag,
          location.subArea
        )
        if (!cragResult.success) throw new Error(cragResult.error || 'Failed to update crag metadata')
      }

      const newRoutes = editor.editedRoutes.filter(
        (route) => !route.climb_id || route.created_at === 'draft-created'
      )
      const existingRoutes = editor.editedRoutes.filter(
        (route) => route.climb_id && route.created_at !== 'draft-created'
      )

      let reconciledRoutes = editor.editedRoutes

      if (newRoutes.length > 0) {
        const result = await createPublishedSubmissionRoutesAction(editor.activeImageId, {
          routes: newRoutes.map((route) => ({
            name: route.climb?.name || 'Unnamed',
            grade: route.climb?.grade || '6A',
            description: route.climb?.description ?? null,
            points: route.points,
            sequenceOrder: route.sequence_order,
            imageWidth: route.image_width,
            imageHeight: route.image_height,
          })),
        })
        if (!result.success) throw new Error(result.error || 'Failed to create routes')

        const createdRoutes = readCreatedRoutesPayload(result.data)
          .map((route) => normalizePublishedRoute(route, editor.activeImageId))
          .filter((route): route is RouteLine => route !== null)

        reconciledRoutes = replaceDraftRoutesWithPublishedRoutes(reconciledRoutes, createdRoutes)
      }

      if (existingRoutes.length > 0 && !areSerializedRoutesEqual(
        serializeStoredRoutes(existingRoutes),
        serializeStoredRoutes(editor.initialEditedRoutes.filter(
          (r) => r.climb_id && r.created_at !== 'draft-created'
        ))
      )) {
        const result = await updatePublishedSubmissionRoutesAction(editor.activeImageId, {
          routes: existingRoutes.map((route) => ({
            id: route.id,
            name: route.climb?.name || 'Unnamed',
            description: route.climb?.description ?? null,
            points: route.points,
            sequenceOrder: route.sequence_order,
          })),
        })
        if (!result.success) throw new Error(result.error || 'Failed to save routes')
      }

      if (existingRoutes.length > 0) {
        const gradeVotePayload = existingRoutes
          .filter((route) => route.id && route.climb?.grade)
          .map((route) => ({ routeLineId: route.id, grade: route.climb?.grade || '6A' }))

        if (gradeVotePayload.length > 0) {
          const gradeVotesResult = await saveSubmissionGradeVotesAction(editor.activeImageId, gradeVotePayload)
          if (!gradeVotesResult.success) throw new Error(gradeVotesResult.error || 'Failed to save route grades')
        }
      }

      editor.setEditedRoutes(reconciledRoutes)
      setRoutes(reconciledRoutes)
      editor.setInitialEditedRoutes(reconciledRoutes)

      editor.setSuccess('Submission changes saved')
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : 'Failed to save submission changes')
    } finally {
      setSavingAllChanges(false)
    }
  }, [editor, location, savingAllChanges, setRoutes])

  if (editor.loading) {
    return <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" /></div>
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <SubmissionToolbar hasPendingChanges={location.imageMetadataDirty || location.cragMetadataDirty || editor.creditDirty || editor.anonymityDirty || !areSerializedRoutesEqual(serializeStoredRoutes(editor.editedRoutes), serializeStoredRoutes(editor.initialEditedRoutes))} savingAllChanges={savingAllChanges} onSaveAllChanges={() => { void handleSaveAllChanges() }} />
        {editor.error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{editor.error}</div> : null}
        {editor.success ? <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">{editor.success}</div> : null}
        <SubmissionLocationPanel atlasSync={atlasSync} canEditCragMetadata={location.canEditCragMetadata} cragName={location.cragName} onCragNameChange={(value) => { location.setCragName(value); editor.setCragName(value) }} regionTag={location.regionTag} onRegionTagChange={(value) => { location.setRegionTag(value); editor.setRegionTag(value) }} subArea={location.subArea} onSubAreaChange={(value) => { location.setSubArea(value); editor.setSubArea(value) }} latitude={location.latitude} onLatitudeChange={(value) => { location.setLatitude(value); editor.setLatitude(value) }} longitude={location.longitude} onLongitudeChange={(value) => { location.setLongitude(value); editor.setLongitude(value) }} searchQuery={location.searchQuery} onSearchQueryChange={location.setSearchQuery} onSearchLocation={() => { void location.handleSearchLocation() }} searchingLocation={location.searchingLocation} locationSearchError={location.locationSearchError} />
        {editor.hasReadyData && editor.activeImageUrl ? <SubmissionWorkstation drawingAreaRef={drawingAreaRef} routeCanvasRef={routeCanvasRef} quickSwitcherImages={editor.quickSwitcherImages} activeImageId={editor.activeImageId} activeImageUrl={editor.activeImageUrl} draftPins={editor.publishedDraftPins} publishedPins={[]} initialCenter={editor.markerPosition} onSelectImage={editor.handleQuickSwitchImage} existingRouteLines={editor.editedRoutes} selectedRouteId={selectedRouteId} onSelectRoute={(routeId) => { setSelectedRoute(routeId); setActiveRoute(routeId); setEditorPanelOpen(true) }} onReorderRoutes={(routeIds) => { const reordered = routeIds.map((routeId, index) => { const route = editor.editedRoutes.find((item) => item.id === routeId); return route ? { ...route, sequence_order: index } : null }).filter((route): route is RouteLine => route !== null); handleCanvasRoutesUpdate(reordered) }} interactionTool={interactionTool === 'select' ? 'select' : 'draw'} currentPointsCount={currentPoints.length} onSetSelectTool={() => { setInteractionTool('select'); setEditorPanelOpen(true) }} onSetDrawTool={() => { setInteractionTool('draw'); setEditorPanelOpen(false) }} onUndoPoint={() => undoLastPoint()} onFinishRoute={() => routeCanvasRef.current?.finishRoute()} canvasKey={`${editor.canvasKey}:${editor.activeImageId}`} extraAction={null} onRoutesUpdate={handleCanvasRoutesUpdate} /> : null}
        <SubmissionDetailsPanel detailsOpen={detailsOpen} onDetailsToggle={() => setDetailsOpen((open) => !open)} orientationOpen={orientationOpen} onOrientationToggle={() => setOrientationOpen((open) => !open)} faceDirections={location.faceDirections} onToggleFaceDirection={(direction) => { location.toggleFaceDirection(direction); editor.toggleFaceDirection(direction) }} owner={editor.owner} contributors={editor.contributors} history={editor.history} canEditCredit={editor.canEditContributionCredit} isAnonymous={editor.isAnonymousSubmission} onAnonymousChange={editor.setIsAnonymousSubmission} creditPlatform={editor.creditPlatform} onCreditPlatformChange={editor.setCreditPlatform} creditHandle={editor.creditHandle} onCreditHandleChange={editor.setCreditHandle} />
      </div>
    </div>
  )
}
