'use client'

import { forwardRef, useRef, useEffect, useCallback, useImperativeHandle, useMemo } from 'react'
import { useRouteStore } from '@/store/routeStore'
import { useCanvasResize } from '@/hooks/useCanvasResize'
import { usePanZoom } from '@/hooks/usePanZoom'
import { useRouteDrawing } from '@/hooks/useRouteDrawing'
import { useHitTesting } from '@/hooks/useHitTesting'
import { getGradeSystemForClimbType, useGradePreferences } from '@/hooks/useGradeSystem'
import { uploadDebug } from '@/lib/media/upload-debug'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { drawRoutes } from '@/lib/routeRenderer'
import { RouteEditSidebar } from '@/components/RouteEditSidebar'
import type { CanvasMode, RouteLine } from '@/types/domain'
import type { ClimbType } from '@/lib/submission-types'

interface UnifiedRouteCanvasProps {
  mode: CanvasMode
  imageUrl: string
  routes?: RouteLine[]
  activeRouteId?: string | null
  onRouteSelect?: (routeId: string | null) => void
  onRoutesUpdate?: (routes: RouteLine[]) => void
  className?: string
}

export interface UnifiedRouteCanvasRef {
  finishRoute: () => void
}

export const UnifiedRouteCanvas = forwardRef<UnifiedRouteCanvasRef, UnifiedRouteCanvasProps>(function UnifiedRouteCanvas({
  mode,
  imageUrl,
  routes: propRoutes,
  activeRouteId: controlledActiveRouteId,
  onRouteSelect,
  onRoutesUpdate,
  className = '',
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    setActiveRoute,
    activeRouteId,
    currentPoints,
    interactionTool,
    selectedRouteId,
    currentDrawing,
    routeEditorDraft,
    editorPanelOpen,
    setEditorIntent,
    setEditorPanelOpen,
    setSelectedRoute,
    commitCurrentRoute,
  } = useRouteStore()
  const gradePreferences = useGradePreferences()

  const routes = useMemo(() => propRoutes || [], [propRoutes])
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId]
  )
  const resolvedActiveRouteId = mode === 'browse' ? controlledActiveRouteId ?? null : activeRouteId

  const { containerRef, dimensions, imageElement, imageLoaded, imageError } = useCanvasResize(imageUrl)

  useEffect(() => {
    uploadDebug('canvas-component-state', {
      imageUrl,
      imageLoaded,
      imageError,
    })
  }, [imageError, imageLoaded, imageUrl])

  const finalDimensions = dimensions

  const imageBounds = useMemo(() => {
    if (!imageElement || !finalDimensions) return null

    const hRatio = finalDimensions.width / imageElement.naturalWidth
    const vRatio = finalDimensions.height / imageElement.naturalHeight
    const ratio = Math.min(hRatio, vRatio)

    const width = imageElement.naturalWidth * ratio
    const height = imageElement.naturalHeight * ratio

    const centerX = (finalDimensions.width - width) / 2
    const centerY = (finalDimensions.height - height) / 2

    return {
      width,
      height,
      centerX,
      centerY,
    }
  }, [imageElement, finalDimensions])

  usePanZoom()

  const { isDrawingEnabled, addPoint } = useRouteDrawing()

  const { handleRouteClick } = useHitTesting(routes)

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas || !imageBounds) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top

      const normX = screenX / imageBounds.width
      const normY = screenY / imageBounds.height

      return { x: normX, y: normY }
    },
    [imageBounds]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 0 && !e.altKey) {
        const point = getCanvasPoint(e.clientX, e.clientY)

        if (isDrawingEnabled) {
          addPoint(point)
        } else {
          const clickedRouteId = handleRouteClick(point)
          if (onRouteSelect) {
            onRouteSelect(clickedRouteId ?? null)
          }
        }
      }
    },
    [getCanvasPoint, isDrawingEnabled, addPoint, handleRouteClick, onRouteSelect]
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 1) return

      if (e.touches.length === 1) {
        const touch = e.touches[0]
        const point = getCanvasPoint(touch.clientX, touch.clientY)

        if (isDrawingEnabled) {
          addPoint(point)
        } else {
          handleRouteClick(point)
        }
      }
    },
    [getCanvasPoint, isDrawingEnabled, addPoint, handleRouteClick]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 1) return
    },
    []
  )

  const handleTouchEnd = useCallback(() => {}, [])

  const handleFinishRoute = useCallback(() => {
    if (currentPoints.length < 2 || !onRoutesUpdate) return

    const nextRoute: RouteLine = {
      id: crypto.randomUUID(),
      image_id: routes[0]?.image_id || 'draft-image',
      climb_id: '',
      points: [...currentPoints],
      color: 'red',
      sequence_order: routes.length,
      created_at: 'draft-created',
    }

    onRoutesUpdate([...routes, nextRoute])
    commitCurrentRoute()
  }, [commitCurrentRoute, currentPoints, onRoutesUpdate, routes])

  useImperativeHandle(ref, () => ({
    finishRoute: handleFinishRoute,
  }), [handleFinishRoute])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !finalDimensions) return

    if (!imageElement || imageElement.naturalWidth === 0) return

    const hRatio = finalDimensions.width / imageElement.naturalWidth
    const vRatio = finalDimensions.height / imageElement.naturalHeight
    const ratio = Math.min(hRatio, vRatio)

    const drawWidth = imageElement.naturalWidth * ratio
    const drawHeight = imageElement.naturalHeight * ratio
    const centerX = (finalDimensions.width - drawWidth) / 2
    const centerY = (finalDimensions.height - drawHeight) / 2

    const dpr = window.devicePixelRatio || 1
    canvas.width = drawWidth * dpr
    canvas.height = drawHeight * dpr
    canvas.style.width = `${drawWidth}px`
    canvas.style.height = `${drawHeight}px`
    canvas.style.position = 'absolute'
    canvas.style.left = `${centerX}px`
    canvas.style.top = `${centerY}px`

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    ctx.drawImage(imageElement, 0, 0, drawWidth, drawHeight)

    const routeCanvasDimensions = {
      width: drawWidth,
      height: drawHeight,
      centerX: 0,
      centerY: 0,
    }

    drawRoutes(
      ctx,
      routes,
      resolvedActiveRouteId,
      currentPoints,
      routeCanvasDimensions,
      mode,
      interactionTool
    )

    ctx.restore()
  }, [
    routes,
    resolvedActiveRouteId,
    currentPoints,
    finalDimensions,
    mode,
    interactionTool,
    imageElement
  ])

  const cursorStyle = isDrawingEnabled && currentPoints.length > 0 ? 'crosshair' : 'default'

  const resolveClimbType = useCallback((climbType: string | null | undefined): ClimbType => {
    if (climbType === 'sport' || climbType === 'boulder' || climbType === 'trad' || climbType === 'deep-water-solo') {
      return climbType
    }
    return 'boulder'
  }, [])

  const overlayDraft = routeEditorDraft
  const overlayDraftRouteId = routeEditorDraft?.routeId ?? null

  const selectedRouteType = selectedRoute?.climb?.route_type
  const drawingClimbType = currentDrawing?.climbType
  const overlayClimbType = overlayDraft
    ? resolveClimbType(overlayDraft.climbType)
    : selectedRouteType
      ? resolveClimbType(selectedRouteType)
      : resolveClimbType(drawingClimbType)

  const overlayGrade = overlayDraft?.grade || selectedRoute?.climb?.grade || currentDrawing?.grade || '6A'
  const overlayName = overlayDraft?.name || selectedRoute?.climb?.name || currentDrawing?.name || 'Unnamed route'

  const overlayGradeLabel = useMemo(() => {
    const gradeSystem = getGradeSystemForClimbType(overlayClimbType, gradePreferences)
    return formatGradeForDisplay(overlayGrade, gradeSystem)
  }, [overlayGrade, overlayClimbType, gradePreferences])

  const overlayClimbTypeLabel = useMemo(() => {
    switch (overlayClimbType) {
      case 'sport':
        return 'Sport'
      case 'trad':
        return 'Trad'
      case 'deep-water-solo':
        return 'Deep Water Solo'
      default:
        return 'Boulder'
    }
  }, [overlayClimbType])

  const showOverlay = mode !== 'browse' && (Boolean(selectedRouteId) || (isDrawingEnabled && currentPoints.length > 0))

  const handleOverlayIntent = useCallback((intent: 'grade' | 'name' | 'type') => {
    if (!selectedRouteId && overlayDraftRouteId) {
      setActiveRoute(overlayDraftRouteId)
    }
    if (!selectedRouteId && overlayDraftRouteId) {
      setSelectedRoute(overlayDraftRouteId)
    }
    setEditorPanelOpen(true)
    setEditorIntent(intent)
  }, [selectedRouteId, overlayDraftRouteId, setActiveRoute, setEditorIntent, setEditorPanelOpen, setSelectedRoute])

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">
          Failed to load image
        </div>
      )}

      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{ cursor: cursorStyle, touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {showOverlay ? (
        <div className="pointer-events-auto absolute left-4 top-4 z-20 rounded-2xl border border-white/70 bg-black/65 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Current route</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <button
              type="button"
              onClick={() => handleOverlayIntent('name')}
              className="max-w-[16rem] truncate text-left text-base font-semibold text-white transition hover:text-white/80"
            >
              {overlayName}
            </button>
            <span className="text-sm text-white/55">-</span>
            <button
              type="button"
              onClick={() => handleOverlayIntent('grade')}
              className="text-left text-lg font-semibold tabular-nums text-white transition hover:text-white/80"
            >
              {overlayGradeLabel}
            </button>
            <button
              type="button"
              onClick={() => handleOverlayIntent('type')}
              className="text-left text-sm text-white/80 transition hover:text-white"
            >
              {overlayClimbTypeLabel}
            </button>
          </div>
        </div>
      ) : null}

      {mode !== 'browse' && editorPanelOpen && <RouteEditSidebar />}
    </div>
  )
})
