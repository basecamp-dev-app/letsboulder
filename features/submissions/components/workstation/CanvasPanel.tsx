'use client'

import { useState } from 'react'
import { UnifiedRouteCanvas, type UnifiedRouteCanvasRef } from '@/features/route-editor/public'
import type { ClimbType } from '@/types/climbing'
import type { RouteLine } from '@/types/domain'
import type { RouteEditorDraft } from '@/features/route-editor/public'
import type { MediaUploadStatus } from '@/features/media-upload/public'

interface WorkstationCanvasPanelProps {
  routeCanvasRef?: React.RefObject<UnifiedRouteCanvasRef | null>
  activeImageReady: boolean
  activeImageStatus?: MediaUploadStatus
  activeStatusLabel: string
  activeImageUrl: string
  canvasKey: string
  canvasMode: 'edit-existing'
  defaultClimbType: ClimbType
  existingRouteLines: RouteLine[]
  onRoutesUpdate?: (routes: RouteLine[]) => void
  allowDelete?: boolean
  onRetryActiveImage?: () => void
  onDeleteActiveImage?: () => void
  onRouteMetadataChange?: (routeId: string, updates: Partial<Omit<RouteEditorDraft, 'routeId'>>) => void
}

export function WorkstationCanvasPanel({
  routeCanvasRef,
  activeImageReady,
  activeImageStatus,
  activeStatusLabel,
  activeImageUrl,
  canvasKey,
  canvasMode,
  defaultClimbType,
  existingRouteLines,
  onRoutesUpdate,
  allowDelete = false,
  onRetryActiveImage,
  onDeleteActiveImage,
  onRouteMetadataChange,
}: WorkstationCanvasPanelProps) {
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape'>('landscape')

  return (
    <div className={`overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${imageOrientation === 'portrait' ? 'min-h-[72dvh] md:min-h-[78dvh]' : 'min-h-[52dvh] md:min-h-[60dvh]'}`}>
      {activeImageReady ? (
        <UnifiedRouteCanvas
          ref={routeCanvasRef}
          key={canvasKey}
          mode={canvasMode}
          imageUrl={activeImageUrl}
          defaultClimbType={defaultClimbType}
          routes={existingRouteLines}
          onRoutesUpdate={onRoutesUpdate}
          useStoreRoutes
          allowDelete={allowDelete}
          onRouteMetadataChange={onRouteMetadataChange}
          onImageOrientationChange={setImageOrientation}
          className={imageOrientation === 'portrait' ? 'h-full min-h-[72dvh] md:min-h-[78dvh]' : 'h-full min-h-[52dvh] md:min-h-[60dvh]'}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-100 px-6 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-300">
          <div>{activeStatusLabel}</div>
          {activeImageStatus === 'FAILED' ? (
            <div className="flex items-center gap-2">
              {onRetryActiveImage ? (
                <button
                  type="button"
                  onClick={onRetryActiveImage}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Retry
                </button>
              ) : null}
              {onDeleteActiveImage ? (
                <button
                  type="button"
                  onClick={onDeleteActiveImage}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
