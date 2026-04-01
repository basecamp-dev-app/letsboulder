'use client'

import { useMemo, useState } from 'react'
import { WorkstationCanvasPanel } from '@/features/submissions/components/workstation/canvas-panel'
import { WorkstationHeader } from '@/features/submissions/components/workstation/header'
import { WorkstationImageStrip } from '@/features/submissions/components/workstation/image-strip'
import { WorkstationMapPanel } from '@/features/submissions/components/workstation/map-panel'
import { WorkstationToolBar } from '@/features/submissions/components/workstation/tool-bar'
import type { ClimbType } from '@/features/submissions/lib/submission-types'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { RouteEditorRail } from '@/features/route-editor/components/RouteEditorRail'
import type { UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import type { RouteLine } from '@/types/domain'

interface WorkstationImage {
  imageId: string
  signedUrl: string
  badgeNumber: number
  isDefault?: boolean
  status?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  error?: string | null
  progress?: number
  locationMode?: 'shared' | 'custom'
}

interface SubmissionWorkstationProps {
  drawingAreaRef: React.RefObject<HTMLDivElement | null>
  routeCanvasRef?: React.RefObject<UnifiedRouteCanvasRef | null>
  quickSwitcherImages: WorkstationImage[]
  activeImageId: string | null
  activeImageUrl: string
  activeImageReady?: boolean
  activeImageStatus?: WorkstationImage['status']
  imageSwitchingDisabled?: boolean
  onRetryActiveImage?: () => void
  onDeleteActiveImage?: () => void
  draftPins?: LightweightCragMapPin[]
  publishedPins?: LightweightCragMapPin[]
  initialCenter?: [number, number] | null
  onSelectImage: (imageId: string) => void
  onReorderImages?: (imageIds: string[]) => void
  existingRouteLines: RouteLine[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  onReorderRoutes?: (routeIds: string[]) => void
  interactionTool: 'select' | 'draw'
  currentPointsCount: number
  onSetSelectTool: () => void
  onSetDrawTool: () => void
  onUndoPoint: () => void
  onFinishRoute: () => void
  canvasKey: string
  extraAction?: React.ReactNode
  addAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
  removeAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
  onQuickBarDropFiles?: (files: File[]) => void
  canvasMode?: 'edit-existing'
  defaultClimbType?: ClimbType
  onRoutesUpdate: (routes: RouteLine[]) => void
  hideRouteActions?: boolean
}

export function SubmissionWorkstation({
  drawingAreaRef,
  routeCanvasRef,
  quickSwitcherImages,
  activeImageId,
  activeImageUrl,
  activeImageReady = true,
  activeImageStatus,
  imageSwitchingDisabled = false,
  onRetryActiveImage,
  onDeleteActiveImage,
  draftPins = [],
  publishedPins = [],
  initialCenter = null,
  onSelectImage,
  onReorderImages,
  existingRouteLines,
  selectedRouteId,
  onSelectRoute,
  onReorderRoutes,
  interactionTool,
  currentPointsCount,
  onSetSelectTool,
  onSetDrawTool,
  onUndoPoint,
  onFinishRoute,
  canvasKey,
  extraAction,
  addAction,
  removeAction,
  onQuickBarDropFiles,
  canvasMode = 'edit-existing',
  defaultClimbType = 'boulder',
  onRoutesUpdate,
  hideRouteActions = false,
}: SubmissionWorkstationProps) {
  const [isQuickBarDragOver, setIsQuickBarDragOver] = useState(false)

  const activeImageLabel = useMemo(() => {
    const activeImage = quickSwitcherImages.find((image) => image.imageId === activeImageId)
    if (!activeImage) return 'No active image'
    return activeImage.isDefault ? `Default ${activeImage.badgeNumber}` : `Image ${activeImage.badgeNumber}`
  }, [activeImageId, quickSwitcherImages])
  const routeCountLabel = existingRouteLines.length === 1 ? '1 route' : `${existingRouteLines.length} routes`

  const activeStatusLabel = activeImageStatus === 'QUEUED'
    ? 'Waiting in queue...'
    : activeImageStatus === 'PREPROCESSING'
      ? 'Compressing and preparing...'
      : activeImageStatus === 'FAILED'
        ? 'Upload failed.'
        : 'Uploading...'

  return (
    <div ref={drawingAreaRef} className="mb-1 space-y-3">
      <WorkstationHeader
        activeImageLabel={activeImageLabel}
        routeCountLabel={routeCountLabel}
        activeImageStatus={activeImageStatus}
        activeStatusLabel={activeStatusLabel}
        extraAction={extraAction}
        addAction={addAction}
        removeAction={removeAction}
      />

      <WorkstationImageStrip
        images={quickSwitcherImages}
        activeImageId={activeImageId}
        isQuickBarDragOver={isQuickBarDragOver}
        imageSwitchingDisabled={imageSwitchingDisabled}
        onSelectImage={onSelectImage}
        onReorderImages={onReorderImages}
        onQuickBarDropFiles={onQuickBarDropFiles}
        onQuickBarDragStateChange={setIsQuickBarDragOver}
        removeAction={removeAction}
      />

      <WorkstationToolBar
        interactionTool={interactionTool}
        currentPointsCount={currentPointsCount}
        routeCountLabel={routeCountLabel}
        hideRouteActions={hideRouteActions}
        onSetSelectTool={onSetSelectTool}
        onSetDrawTool={onSetDrawTool}
        onUndoPoint={onUndoPoint}
        onFinishRoute={onFinishRoute}
      />

      <WorkstationCanvasPanel
        routeCanvasRef={routeCanvasRef}
        activeImageReady={activeImageReady}
        activeImageStatus={activeImageStatus}
        activeStatusLabel={activeStatusLabel}
        activeImageUrl={activeImageUrl}
        canvasKey={canvasKey}
        canvasMode={canvasMode}
        defaultClimbType={defaultClimbType}
        existingRouteLines={existingRouteLines}
        onRoutesUpdate={onRoutesUpdate}
        onRetryActiveImage={onRetryActiveImage}
        onDeleteActiveImage={onDeleteActiveImage}
      />

      <RouteEditorRail
        routes={existingRouteLines}
        selectedRouteId={selectedRouteId}
        onSelectRoute={onSelectRoute}
        onReorderRoutes={onReorderRoutes}
      />

      <WorkstationMapPanel
        draftPins={draftPins}
        publishedPins={publishedPins}
        activeImageId={activeImageId}
        initialCenter={initialCenter}
        imageSwitchingDisabled={imageSwitchingDisabled}
        onSelectImage={onSelectImage}
      />
    </div>
  )
}
