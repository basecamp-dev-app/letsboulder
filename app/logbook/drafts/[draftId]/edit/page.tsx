'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/features/logbook/components/toast'
import { SubmissionWorkstation } from '@/features/submissions/components/SubmissionWorkstation'
import { resequenceRoutes } from '@/features/submissions/lib/editor-image-state'
import type { RouteLine } from '@/features/submissions/lib/submission-types'
import { CollaboratorDialog } from '@/features/submissions/components/editor/collaborator-dialog'
import { useDraftConflictResolution } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import { useDraftRouteEditing } from '@/features/submissions/draft-editor/hooks/use-draft-route-editing'
import { useDraftEditorOrchestration } from '@/features/submissions/draft-editor/hooks/use-draft-editor-orchestration'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DraftToolbar } from '@/features/submissions/draft-editor/components/DraftToolbar'
import { DraftMetadataPanel } from '@/features/submissions/draft-editor/components/DraftMetadataPanel'
import { DraftDetailsPanel } from '@/features/submissions/draft-editor/components/DraftDetailsPanel'
import { DraftUploadQueue } from '@/features/submissions/upload/components/DraftUploadQueue'
import { resolveDraftClimbType } from '@/features/submissions/draft-editor/lib/edit-draft-types'


export default function EditDraftPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string
  const { conflict } = useDraftConflictResolution()
  const routeEditing = useDraftRouteEditing()

  const {
    refs,
    state,
    location,
    canvas,
    uploads,
    draft,
    derived,
    actions,
    collaboration,
  } = useDraftEditorOrchestration({ draftId, addToast })

  const {
    addImageInputRef,
    publishRequirementsRef,
    drawingAreaRef,
    routeCanvasRef,
    skipRouteStoreSyncRef,
  } = refs

  const collaborationAdded = searchParams.get('collab') === 'added'

  if (draft.isInitialLoading && !draft.draft) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <DraftToolbar
          savingDraft={actions.savingDraft}
          publishingDraft={actions.publishingDraft}
          hasConflict={!!conflict}
          isOwner={draft.isOwner}
          draftId={draftId}
          hasPendingUploads={uploads.hasPendingUploads}
          hasFailedUploads={uploads.hasFailedUploads}
          onManualSave={actions.handleManualSave}
          onPublish={() => { void actions.publishDraft() }}
          onDeleteDraft={() => { void actions.handleDeleteDraft() }}
        />

        {collaborationAdded ? (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit this draft.
          </div>
        ) : null}

        {actions.publishAttempted && actions.publishValidationMessage ? (
          <div ref={publishRequirementsRef} className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {actions.publishValidationMessage}
          </div>
        ) : null}

        {draft.error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {draft.error}
          </div>
        ) : null}

        {!draft.error && draft.draft && draft.manageImages.length === 0 ? (
          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {uploads.pendingDraftUploads.length > 0 || draft.draft.images.some((image) => image.readiness_status === 'processing')
              ? 'Photos are still preparing for the editor. They should appear here once image access is ready.'
              : draft.draft.images.length > 0 && draft.draft.images.every((image) => image.readiness_status === 'error')
                ? 'Some photos failed to prepare for the editor. Try re-uploading the affected images.'
                : draft.draft.images.length === 0 && uploads.pendingDraftUploads.length === 0
                  ? 'This draft has no photos yet. Add at least one image to continue.'
                  : 'Photos are still preparing for the editor. They should appear here once image access is ready.'}
          </div>
        ) : null}

        {state.success ? (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {state.success}
          </div>
        ) : null}

        <DraftUploadQueue
          pendingDraftUploads={uploads.pendingDraftUploads}
          queuePaused={uploads.queuePaused}
          draftId={draftId}
          hasPendingUploads={uploads.hasPendingUploads}
          hasFailedUploads={uploads.hasFailedUploads}
          onRetryUpload={uploads.retryUpload}
          onRemoveUpload={(clientId) => { void uploads.removeUpload(clientId) }}
          onResumeQueue={uploads.resumeQueue}
        />

        <input
          ref={addImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void actions.handleAddImages(event.target.files)
          }}
        />

        {derived.imageSelection && 'imageUrl' in derived.imageSelection ? (
          <SubmissionWorkstation
            drawingAreaRef={drawingAreaRef}
            routeCanvasRef={routeCanvasRef}
            quickSwitcherImages={derived.quickSwitcherImages}
            activeImageId={draft.activeImageId}
            activeImageUrl={derived.stableActiveImageUrl}
            activeImageReady={derived.activeImageReady}
            activeImageStatus={derived.activeImageTab?.status}
            imageSwitchingDisabled={state.isImageSwitching}
            onRetryActiveImage={derived.activeImageTab?.status === 'FAILED' ? () => uploads.retryUpload(derived.activeImageTab!.imageId) : undefined}
            onDeleteActiveImage={derived.activeImageTab?.status === 'FAILED' ? () => { void actions.handleRemoveImage(derived.activeImageTab!.imageId) } : undefined}
            draftPins={derived.draftMapPins}
            publishedPins={derived.publishedMapPins}
            initialCenter={location.markerPosition}
            hideRouteActions={location.mapOpen}
            onSelectImage={actions.handleQuickSwitchImage}
            onReorderImages={(imageIds) => { void actions.handleReorderDraftImages(imageIds) }}
            existingRouteLines={derived.existingRouteLines}
            selectedRouteId={canvas.selectedRouteId}
            onSelectRoute={(routeId) => {
              canvas.setSelectedRoute(routeId)
              canvas.setActiveRoute(routeId)
              canvas.setEditorPanelOpen(true)
            }}
            onReorderRoutes={(routeIds) => {
              if (!derived.activeDraftImageId) return
              draft.setRoutesByImageId((prev) => {
                const current = prev[derived.activeDraftImageId!] || []
                const nextRoutes = resequenceRoutes(current, routeIds)
                skipRouteStoreSyncRef.current = derived.activeDraftImageId
                canvas.setRoutes(resequenceRoutes(derived.existingRouteLines, routeIds) as RouteLine[])
                return {
                  ...prev,
                  [derived.activeDraftImageId!]: nextRoutes,
                }
              })
            }}
            interactionTool={canvas.interactionTool === 'select' ? 'select' : 'draw'}
            currentPointsCount={canvas.currentPoints.length}
            onSetSelectTool={() => {
              canvas.setInteractionTool('select')
              canvas.setEditorPanelOpen(true)
            }}
            onSetDrawTool={() => {
              canvas.setInteractionTool('draw')
              canvas.setEditorPanelOpen(false)
            }}
            onUndoPoint={() => canvas.undoLastPoint()}
            onFinishRoute={() => routeCanvasRef.current?.finishRoute()}
            canvasKey={derived.activeImageTab?.imageId || 'draft-canvas'}
            defaultClimbType={resolveDraftClimbType(draft.routeType)}
            extraAction={derived.activeImageTab ? (
              <button
                type="button"
                onClick={actions.setActiveAsDefault}
                disabled={!derived.activeImageReady}
                className="inline-flex h-9 items-center rounded-xl border border-blue-200 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                Default
              </button>
            ) : null}
            addAction={{ loading: false, disabled: !!conflict, onClick: () => addImageInputRef.current?.click() }}
            removeAction={derived.activeImageTab ? {
              loading: false,
              disabled: derived.quickSwitcherImages.length <= 1 || !!conflict,
              onClick: () => { void actions.handleRemoveImage(derived.activeImageTab!.imageId) },
            } : undefined}
            onQuickBarDropFiles={actions.handleQuickBarDropFiles}
            onRoutesUpdate={actions.handleCanvasRoutesUpdate}
          />
        ) : null}

        <DraftMetadataPanel
          atlasSync={derived.atlasSync}
          selectedCrag={draft.selectedCrag}
          showCragSelector={location.showCragSelector}
          cragId={draft.cragId}
          sectorId={state.sectorId}
          activeImageLocationMode={derived.activeImageLocationMode}
          activeDraftImageId={derived.activeDraftImageId}
          latitude={location.latitude}
          longitude={location.longitude}
          customGpsByImageId={draft.customGpsByImageId}
          effectiveMarkerPosition={location.effectiveMarkerPosition}
          mapOpen={location.mapOpen}
          leaflet={draft.leaflet}
          searchQuery={location.searchQuery}
          searchingLocation={location.searchingLocation}
          locationSearchError={location.locationSearchError}
          routeType={draft.routeType}
          onShowCragSelector={actions.onShowCragSelector}
          onSelectCrag={actions.onSelectCrag}
          onCreateCrag={actions.onCreateCrag}
          onSectorChange={state.setSectorId}
          onLocationModeChange={actions.onLocationModeChange}
          onLatitudeChange={actions.onLatitudeChange}
          onLongitudeChange={actions.onLongitudeChange}
          onCustomGpsChange={actions.onCustomGpsChange}
          onMapClick={location.handleMapClick}
          onMarkerDragEnd={location.handleMarkerDragEnd}
          onMapOpenChange={actions.onMapOpenChange}
          onSearchQueryChange={actions.onSearchQueryChange}
          onSearchLocation={location.handleSearchLocation}
          onRouteTypeChange={actions.onRouteTypeChange}
        />

        <DraftDetailsPanel
          detailsOpen={routeEditing.detailsOpen}
          onDetailsToggle={() => routeEditing.setDetailsOpen((prev) => !prev)}
          orientationOpen={routeEditing.orientationOpen}
          onOrientationToggle={() => routeEditing.setOrientationOpen((prev) => !prev)}
          activeImageOrientation={derived.activeImageTab ? (draft.orientationByImageId[derived.activeImageTab.imageId] || []) : []}
          onToggleOrientation={actions.toggleImageOrientation}
          onShareOpen={() => collaboration.setShareOpen(true)}
          canEditCredit={true}
          isAnonymous={draft.isAnonymousSubmission}
          onAnonymousChange={draft.setIsAnonymousSubmission}
          creditPlatform={draft.creditPlatform}
          onCreditPlatformChange={draft.setCreditPlatform}
          creditHandle={draft.creditHandle}
          onCreditHandleChange={draft.setCreditHandle}
        />

        <CollaboratorDialog
          open={collaboration.shareOpen}
          onOpenChange={collaboration.setShareOpen}
          title="Draft collaborators"
          description={draft.isOwner
            ? 'Create a link for collaborators to help edit this draft before publishing.'
            : 'You can view collaborators. Only the owner can manage invites.'}
          isOwner={draft.isOwner}
          ownerUserId={state.ownerUserId}
          ownerProfile={state.ownerProfile}
          collaborators={collaboration.collaborators}
          activeInvites={collaboration.activeInvites}
          loadingCollaborators={collaboration.loadingCollaborators}
          creatingInvite={collaboration.creatingInvite}
          revokingInviteId={collaboration.revokingInviteId}
          removingCollaboratorId={collaboration.removingCollaboratorId}
          latestInviteUrl={collaboration.latestInviteUrl}
          inviteUrlPrefix="/api/submissions/drafts/collaborate"
          onCreateInvite={() => { void collaboration.handleCreateInvite() }}
          onCopyInvite={(url) => { void collaboration.handleCopyInvite(url) }}
          onRevokeInvite={(inviteId) => { void collaboration.handleRevokeInvite(inviteId) }}
          onRemoveCollaborator={(userId) => { void collaboration.handleRemoveCollaborator(userId) }}
          showLeaveButton
          currentUserId={draft.currentUserId}
          onLeave={() => { if (draft.currentUserId) void collaboration.handleRemoveCollaborator(draft.currentUserId) }}
        />

        <Dialog open={!!conflict} onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft updated by another collaborator</DialogTitle>
              <DialogDescription>
                {conflict?.lastEditorName
                  ? `${conflict.lastEditorName} saved a newer version of this draft.`
                  : 'A newer version exists on the server.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Reload the latest draft before continuing. You can copy your unsaved edits first.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void actions.handleReloadLatestDraft() }}
                  className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Reload latest draft
                </button>
                <button
                  type="button"
                  onClick={() => { void actions.handleCopyUnsavedEdits() }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Copy unsaved edits
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
