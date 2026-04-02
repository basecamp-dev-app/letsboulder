'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/features/editor/location/use-atlas-auto-sync'
import { areSerializedRoutesEqual } from '@/features/route-editor/route-editor-utils'
import { ToastContainer, useToast } from '@/features/logbook/components/toast'
import type { UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { useRouteStore } from '@/features/route-editor/store'
import { haveStoredRoutesChanged, serializeStoredRoutes } from '@/features/editor/route-store-sync'
import { createClient } from '@/lib/supabase'
import type { RouteLine } from '@/types/domain'
import { SubmissionWorkstation } from '@/features/submissions/components/SubmissionWorkstation'
import { SubmissionDetailsPanel } from '@/features/submissions/submission-editor/components/SubmissionDetailsPanel'
import { SubmissionToolbar } from '@/features/submissions/submission-editor/components/SubmissionToolbar'
import { SubmissionLocationPanel } from '@/features/submissions/submission-editor/components/SubmissionLocationPanel'
import { DeleteRouteTransferDialog } from '@/features/submissions/submission-editor/components/DeleteRouteTransferDialog'
import { CollaboratorDialog } from '@/features/submissions/components/editor/collaborator-dialog'
import { useSubmissionEditorData } from '@/features/submissions/submission-editor/hooks/use-submission-editor-data'
import { useSubmissionLocationMetadata } from '@/features/submissions/editor/location/use-submission-location-metadata'
import { useSubmissionCollaborators } from '@/features/submissions/editor/collaboration/use-submission-collaborators'

export default function EditSubmittedRoutesPage() {
  const { toasts, addToast, removeToast } = useToast()
  const editor = useSubmissionEditorData()
  const location = useSubmissionLocationMetadata({ currentUserId: editor.currentUserId, ownerUserId: editor.ownerUserId, cragId: editor.cragId, initialLatitude: editor.initialLatitude, initialLongitude: editor.initialLongitude, initialCragName: editor.initialCragName, initialRegionTag: editor.initialRegionTag, initialSubArea: editor.initialSubArea, initialFaceDirections: editor.initialFaceDirections, initialLocationMode: editor.initialLocationMode })
  const collaborators = useSubmissionCollaborators(editor.activeImageId, addToast, editor.setError)
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef | null>(null)
  const lastSeededRouteImageIdRef = useRef<string | null>(null)
  const [savingAllChanges, setSavingAllChanges] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [orientationOpen, setOrientationOpen] = useState(true)
  const [deleteTransferOpen, setDeleteTransferOpen] = useState(false)
  const [deleteTransferSourceRouteName, setDeleteTransferSourceRouteName] = useState('')
  const [deleteTransferCandidates, setDeleteTransferCandidates] = useState<Array<{ routeLineId: string; climbName: string; grade: string | null }>>([])
  const [selectedTargetRouteLineId, setSelectedTargetRouteLineId] = useState('')
  const [pendingDeleteRouteLineId, setPendingDeleteRouteLineId] = useState<string | null>(null)
  const [deletingRoute, setDeletingRoute] = useState(false)
  const atlasSync = useAtlasAutoSync(editor.markerPosition?.[0] ?? null, editor.markerPosition?.[1] ?? null)
  const {
    selectedRouteId,
    routes: routeStoreRoutes,
    setRoutes: setRouteStoreRoutes,
    setSelectedRoute,
    setActiveRoute,
    setEditorPanelOpen,
    currentPoints,
    interactionTool,
    undoLastPoint,
    setInteractionTool,
  } = useRouteStore()
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
    if (!collaborators.shareOpen) return
    void collaborators.loadCollaborators()
  }, [collaborators, collaborators.loadCollaborators, collaborators.shareOpen])

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    setRouteStoreRoutes(routes)
    editor.setEditedRoutes(routes)
  }, [editor, setRouteStoreRoutes])

  useEffect(() => {
    if (!editor.activeImageId) return
    if (!editor.existingRouteLines?.length) return

    if (lastSeededRouteImageIdRef.current === editor.activeImageId) {
      if (haveStoredRoutesChanged(routeStoreRoutes, editor.existingRouteLines)) {
        editor.setEditedRoutes(routeStoreRoutes)
      }
      return
    }

    lastSeededRouteImageIdRef.current = editor.activeImageId
    setRouteStoreRoutes(editor.existingRouteLines)
    editor.setEditedRoutes(editor.existingRouteLines)
  }, [editor, editor.activeImageId, editor.existingRouteLines, editor.setEditedRoutes, routeStoreRoutes, setRouteStoreRoutes])

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
        const response = await csrfFetch(`/api/submissions/${editor.activeImageId}/image`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude,
            longitude,
            faceDirections: location.faceDirections,
            locationMode: location.locationMode,
          }),
        })
        const payload = await response.json().catch(() => null) as { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || 'Failed to save image metadata')

        const supabase = createClient()
        const { error: updateImageError } = await supabase
          .from('images')
          .update({
            contribution_credit_platform: editor.creditPlatform,
            contribution_credit_handle: editor.creditHandle.trim() || null,
            is_anonymous_submission: editor.isAnonymousSubmission,
          })
          .eq('id', editor.activeImageId)
        if (updateImageError) throw updateImageError
      }

      if (location.cragMetadataDirty && editor.cragId && location.canEditCragMetadata) {
        const supabase = createClient()
        const { error: updateCragError } = await supabase
          .from('crags')
          .update({
            name: location.cragName.trim(),
            region_name: location.regionTag.trim() || null,
            sub_area: location.subArea.trim() || null,
          })
          .eq('id', editor.cragId)
        if (updateCragError) throw updateCragError
      }

      const newRoutes = editor.editedRoutes.filter(
        (route) => !route.climb_id || route.created_at === 'draft-created'
      )
      const existingRoutes = editor.editedRoutes.filter(
        (route) => route.climb_id && route.created_at !== 'draft-created'
      )

      if (newRoutes.length > 0) {
        const response = await csrfFetch(`/api/submissions/${editor.activeImageId}/routes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routes: newRoutes.map((route) => ({
              name: route.climb?.name || 'Unnamed',
              grade: route.climb?.grade || '6A',
              description: route.climb?.description ?? null,
              points: route.points,
              sequenceOrder: route.sequence_order,
              imageWidth: route.image_width,
              imageHeight: route.image_height,
            })),
          }),
        })
        const payload = await response.json().catch(() => null) as { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || 'Failed to create routes')
      }

      if (existingRoutes.length > 0 && !areSerializedRoutesEqual(
        serializeStoredRoutes(existingRoutes),
        serializeStoredRoutes(editor.initialEditedRoutes.filter(
          (r) => r.climb_id && r.created_at !== 'draft-created'
        ))
      )) {
        const response = await csrfFetch(`/api/submissions/${editor.activeImageId}/routes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routes: existingRoutes.map((route) => ({
              id: route.id,
              name: route.climb?.name || 'Unnamed',
              description: route.climb?.description ?? null,
              points: route.points,
              sequenceOrder: route.sequence_order,
            })),
          }),
        })
        const payload = await response.json().catch(() => null) as { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || 'Failed to save routes')
      }

      if (newRoutes.length > 0) {
        window.location.reload()
      } else {
        editor.setInitialEditedRoutes(editor.editedRoutes)
      }

      editor.setSuccess('Submission changes saved')
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : 'Failed to save submission changes')
    } finally {
      setSavingAllChanges(false)
    }
  }, [editor, location, savingAllChanges])

  const handleDeleteRoute = useCallback(async (routeLineId: string, targetRouteLineId?: string) => {
    if (!editor.activeImageId || deletingRoute) return
    setDeletingRoute(true)
    editor.setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${editor.activeImageId}/routes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeLineId, transferLogsToSameName: true, targetRouteLineId: targetRouteLineId || null }),
      })
      const payload = await response.json().catch(() => null) as {
        error?: string
        code?: string
        sourceRouteName?: string
        candidates?: Array<{ routeLineId: string; climbName: string; grade: string | null }>
      } | null

      if (response.status === 409 && payload?.code === 'multiple_transfer_targets' && payload.candidates && payload.candidates.length > 0) {
        setPendingDeleteRouteLineId(routeLineId)
        setDeleteTransferSourceRouteName(payload.sourceRouteName || '')
        setDeleteTransferCandidates(payload.candidates)
        setSelectedTargetRouteLineId(payload.candidates[0]?.routeLineId || '')
        setDeleteTransferOpen(true)
        return
      }

      if (!response.ok) throw new Error(payload?.error || 'Failed to delete route')
        editor.setSuccess('Route deleted')
        editor.setCanvasKey((value) => value + 1)
        window.location.reload()
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : 'Failed to delete route')
    } finally {
      setDeletingRoute(false)
    }
  }, [deletingRoute, editor])

  const deleteDialogCandidates = useMemo(() => deleteTransferCandidates, [deleteTransferCandidates])

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
        {editor.hasReadyData && editor.activeImageUrl ? <SubmissionWorkstation drawingAreaRef={drawingAreaRef} routeCanvasRef={routeCanvasRef} quickSwitcherImages={editor.quickSwitcherImages} activeImageId={editor.activeImageId} activeImageUrl={editor.activeImageUrl} draftPins={editor.publishedDraftPins} publishedPins={[]} initialCenter={editor.markerPosition} onSelectImage={editor.handleQuickSwitchImage} onReorderImages={(imageIds) => { void editor.handleReorderImages(imageIds) }} existingRouteLines={editor.editedRoutes} selectedRouteId={selectedRouteId} onSelectRoute={(routeId) => { setSelectedRoute(routeId); setActiveRoute(routeId); setEditorPanelOpen(true) }} onReorderRoutes={(routeIds) => { const reordered = routeIds.map((routeId, index) => { const route = editor.editedRoutes.find((item) => item.id === routeId); return route ? { ...route, sequence_order: index } : null }).filter((route): route is RouteLine => route !== null); handleCanvasRoutesUpdate(reordered) }} interactionTool={interactionTool === 'select' ? 'select' : 'draw'} currentPointsCount={currentPoints.length} onSetSelectTool={() => { setInteractionTool('select'); setEditorPanelOpen(true) }} onSetDrawTool={() => { setInteractionTool('draw'); setEditorPanelOpen(false) }} onUndoPoint={() => undoLastPoint()} onFinishRoute={() => routeCanvasRef.current?.finishRoute()} canvasKey={`${editor.canvasKey}:${editor.activeImageId}`} extraAction={null} onRoutesUpdate={handleCanvasRoutesUpdate} /> : null}
        <SubmissionDetailsPanel detailsOpen={detailsOpen} onDetailsToggle={() => setDetailsOpen((open) => !open)} orientationOpen={orientationOpen} onOrientationToggle={() => setOrientationOpen((open) => !open)} faceDirections={location.faceDirections} onToggleFaceDirection={(direction) => { location.toggleFaceDirection(direction); editor.toggleFaceDirection(direction) }} onShareOpen={() => collaborators.setShareOpen(true)} canEditCredit={editor.canEditContributionCredit} isAnonymous={editor.isAnonymousSubmission} onAnonymousChange={editor.setIsAnonymousSubmission} creditPlatform={editor.creditPlatform} onCreditPlatformChange={editor.setCreditPlatform} creditHandle={editor.creditHandle} onCreditHandleChange={editor.setCreditHandle} />
        <DeleteRouteTransferDialog open={deleteTransferOpen} sourceRouteName={deleteTransferSourceRouteName} candidates={deleteDialogCandidates} selectedTargetRouteLineId={selectedTargetRouteLineId} onSelectedTargetChange={setSelectedTargetRouteLineId} deleting={deletingRoute} onConfirm={() => { if (pendingDeleteRouteLineId) void handleDeleteRoute(pendingDeleteRouteLineId, selectedTargetRouteLineId) }} onCancel={() => { setDeleteTransferOpen(false); setPendingDeleteRouteLineId(null); setDeleteTransferCandidates([]); setDeleteTransferSourceRouteName(''); setSelectedTargetRouteLineId('') }} />
        <CollaboratorDialog open={collaborators.shareOpen} onOpenChange={collaborators.setShareOpen} title="Collaborators" description="Create a link for collaborators to edit routes, location, and face directions." isOwner={collaborators.isOwner} ownerUserId={collaborators.ownerUserId} ownerProfile={collaborators.ownerProfile} collaborators={collaborators.collaborators} activeInvites={collaborators.activeInvites} loadingCollaborators={collaborators.loadingCollaborators} creatingInvite={collaborators.creatingInvite} revokingInviteId={collaborators.revokingInviteId} removingCollaboratorId={collaborators.removingCollaboratorId} latestInviteUrl={collaborators.latestInviteUrl} inviteUrlPrefix="/api/submissions/collaborate" onCreateInvite={collaborators.handleCreateInvite} onCopyInvite={collaborators.handleCopyInvite} onRevokeInvite={collaborators.handleRevokeInvite} onRemoveCollaborator={collaborators.handleRemoveCollaborator} />
      </div>
    </div>
  )
}
