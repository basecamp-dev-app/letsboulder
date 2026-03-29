'use client'

import { Loader2 } from 'lucide-react'
import { SubmissionWorkstation } from '@/components/SubmissionWorkstation'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { SubmissionDetailsPanel } from './components/submission-details-panel'
import { SubmissionToolbar } from './components/submission-toolbar'
import { SubmissionLocationPanel } from './components/submission-location-panel'
import { DeleteRouteTransferDialog } from './components/delete-route-transfer-dialog'
import { CollaboratorDialog } from '@/components/editor/collaborator-dialog'
import { useSubmissionEditorData } from './hooks/use-submission-editor-data'
import { useSubmissionLocationMetadata } from './hooks/use-submission-location-metadata'
import { useSubmissionCollaborators } from './hooks/use-submission-collaborators'

export default function EditSubmittedRoutesPage() {
  const { toasts, addToast, removeToast } = useToast()
  const editor = useSubmissionEditorData()
  const location = useSubmissionLocationMetadata({ currentUserId: editor.currentUserId, ownerUserId: editor.ownerUserId, cragId: editor.cragId, initialLatitude: editor.initialLatitude, initialLongitude: editor.initialLongitude, initialCragName: editor.initialCragName, initialRegionTag: editor.initialRegionTag, initialSubArea: editor.initialSubArea, initialFaceDirections: editor.initialFaceDirections, initialLocationMode: editor.initialLocationMode })
  const collaborators = useSubmissionCollaborators(editor.activeImageId, addToast, editor.setError)

  if (editor.loading) {
    return <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" /></div>
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <SubmissionToolbar hasPendingChanges={editor.hasPendingChanges} savingAllChanges={false} onSaveAllChanges={async () => {}} />
        {editor.error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{editor.error}</div> : null}
        {editor.success ? <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">{editor.success}</div> : null}
        <SubmissionLocationPanel atlasSync={{} as never} canEditCragMetadata={location.canEditCragMetadata} cragName={location.cragName} onCragNameChange={location.setCragName} regionTag={location.regionTag} onRegionTagChange={location.setRegionTag} subArea={location.subArea} onSubAreaChange={location.setSubArea} latitude={location.latitude} onLatitudeChange={location.setLatitude} longitude={location.longitude} onLongitudeChange={location.setLongitude} searchQuery={location.searchQuery} onSearchQueryChange={location.setSearchQuery} onSearchLocation={location.handleSearchLocation} searchingLocation={location.searchingLocation} locationSearchError={location.locationSearchError} />
        {editor.hasReadyData && editor.activeImageUrl ? <SubmissionWorkstation drawingAreaRef={undefined as never} routeCanvasRef={undefined as never} quickSwitcherImages={editor.quickSwitcherImages} activeImageId={editor.activeImageId} activeImageUrl={editor.activeImageUrl} draftPins={editor.publishedDraftPins} publishedPins={[]} initialCenter={editor.markerPosition} onSelectImage={editor.handleQuickSwitchImage} onReorderImages={async () => {}} existingRouteLines={editor.existingRouteLines} selectedRouteId={undefined as never} onSelectRoute={() => {}} onReorderRoutes={() => {}} interactionTool="draw" currentPointsCount={0} onSetSelectTool={() => {}} onSetDrawTool={() => {}} onUndoPoint={() => {}} onFinishRoute={() => {}} canvasKey={`${editor.canvasKey}:${editor.activeImageId}`} extraAction={null} onRoutesUpdate={editor.setEditedRoutes} /> : null}
        <SubmissionDetailsPanel detailsOpen={false} onDetailsToggle={() => {}} orientationOpen={false} onOrientationToggle={() => {}} faceDirections={location.faceDirections} onToggleFaceDirection={location.toggleFaceDirection} onShareOpen={() => collaborators.setShareOpen(true)} canEditCredit={editor.canEditContributionCredit} isAnonymous={editor.isAnonymousSubmission} onAnonymousChange={editor.setIsAnonymousSubmission} creditPlatform={editor.creditPlatform} onCreditPlatformChange={editor.setCreditPlatform} creditHandle={editor.creditHandle} onCreditHandleChange={editor.setCreditHandle} />
        <DeleteRouteTransferDialog open={false} sourceRouteName="" candidates={[]} selectedTargetRouteLineId="" onSelectedTargetChange={() => {}} deleting={false} onConfirm={() => {}} onCancel={() => {}} />
        <CollaboratorDialog open={collaborators.shareOpen} onOpenChange={collaborators.setShareOpen} title="Collaborators" description="Create a link for collaborators to edit routes, location, and face directions." isOwner={collaborators.isOwner} ownerUserId={collaborators.ownerUserId} ownerProfile={collaborators.ownerProfile} collaborators={collaborators.collaborators} activeInvites={collaborators.activeInvites} loadingCollaborators={collaborators.loadingCollaborators} creatingInvite={collaborators.creatingInvite} revokingInviteId={collaborators.revokingInviteId} removingCollaboratorId={collaborators.removingCollaboratorId} latestInviteUrl={collaborators.latestInviteUrl} inviteUrlPrefix="/api/submissions/collaborate" onCreateInvite={collaborators.handleCreateInvite} onCopyInvite={collaborators.handleCopyInvite} onRevokeInvite={collaborators.handleRevokeInvite} onRemoveCollaborator={collaborators.handleRemoveCollaborator} />
      </div>
    </div>
  )
}
