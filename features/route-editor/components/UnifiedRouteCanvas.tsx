'use client'

import { forwardRef, useRef, useState, useEffect, useCallback, useImperativeHandle, useMemo } from 'react'
import { useContainerSize } from '@/hooks/use-container-size'
import { getGradeSystemForClimbType, useGradePreferences } from '@/lib/grades/preferences'
import { uploadDebug } from '@/lib/media/upload-debug'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { drawRoutes } from '@/lib/route-renderer'
import { RouteCanvasOverlay } from '@/features/route-editor/components/RouteCanvasOverlay'
import { RouteEditSidebar } from '@/features/route-editor/components/RouteEditSidebar'
import { useRouteDrawing } from '@/features/route-editor/hooks/useRouteDrawing'
import { useHitTesting } from '@/features/route-editor/hooks/useHitTesting'
import { useRouteStore } from '@/features/route-editor/store'
import type { CanvasMode, RouteLine } from '@/types/domain'
import type { ClimbType } from '@/types/climbing'

interface UnifiedRouteCanvasProps {
  mode: CanvasMode
  imageUrl: string
  routes?: RouteLine[]
  defaultClimbType?: ClimbType
  activeRouteId?: string | null
  onRouteSelect?: (routeId: string | null) => void
  onRoutesUpdate?: (routes: RouteLine[]) => void
  className?: string
}

export interface UnifiedRouteCanvasRef {
  finishRoute: () => void
}

interface CanvasImageProps {
  src: string
  onImageLoad: (naturalWidth: number, naturalHeight: number) => void
  onImageError: () => void
}

function CanvasImage({ src, onImageLoad, onImageError }: CanvasImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-contain select-none"
      style={{ pointerEvents: 'none' }}
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget
        onImageLoad(img.naturalWidth, img.naturalHeight)
      }}
      onError={onImageError}
    />
  )
}

export const UnifiedRouteCanvas = forwardRef<UnifiedRouteCanvasRef, UnifiedRouteCanvasProps>(function UnifiedRouteCanvas({
  mode,
  imageUrl,
  routes: propRoutes,
  defaultClimbType = 'boulder',
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
  const resolvedActiveRouteId = controlledActiveRouteId ?? activeRouteId

  const { containerRef, dimensions } = useContainerSize()

  const [naturalWidth, setNaturalWidth] = useState(0)
  const [naturalHeight, setNaturalHeight] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    uploadDebug('canvas-component-state', {
      imageUrl,
      imageLoaded,
      imageError,
    })
  }, [imageError, imageLoaded, imageUrl])

  const finalDimensions = dimensions

  const imageBounds = useMemo(() => {
    if (naturalWidth === 0 || !finalDimensions) return null

    const hRatio = finalDimensions.width / naturalWidth
    const vRatio = finalDimensions.height / naturalHeight
    const ratio = Math.min(hRatio, vRatio)

    const width = naturalWidth * ratio
    const height = naturalHeight * ratio

    const centerX = (finalDimensions.width - width) / 2
    const centerY = (finalDimensions.height - height) / 2

    return {
      width,
      height,
      centerX,
      centerY,
    }
  }, [naturalWidth, naturalHeight, finalDimensions])

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

  const lastPointerTimestampRef = useRef(0)

  const handleCanvasPress = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)

    if (isDrawingEnabled) {
      addPoint(point)
      return
    }

    const clickedRouteId = handleRouteClick(point)
    if (onRouteSelect) {
      onRouteSelect(clickedRouteId ?? null)
    }
  }, [addPoint, getCanvasPoint, handleRouteClick, isDrawingEnabled, onRouteSelect])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || event.altKey) return
    lastPointerTimestampRef.current = Date.now()
    handleCanvasPress(event.clientX, event.clientY)
  }, [handleCanvasPress])

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (Date.now() - lastPointerTimestampRef.current < 250) return
    if (event.button !== 0 || event.altKey) return
    handleCanvasPress(event.clientX, event.clientY)
  }, [handleCanvasPress])

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
      image_width: naturalWidth || undefined,
      image_height: naturalHeight || undefined,
      climb: {
        id: '',
        name: 'Unnamed route',
        grade: '6A',
        status: 'draft',
        route_type: defaultClimbType,
        description: null,
      },
    }

    onRoutesUpdate([...routes, nextRoute])
    commitCurrentRoute()
  }, [commitCurrentRoute, currentPoints, defaultClimbType, naturalHeight, naturalWidth, onRoutesUpdate, routes])

  useImperativeHandle(ref, () => ({
    finishRoute: handleFinishRoute,
  }), [handleFinishRoute])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !finalDimensions || !imageLoaded) return

    if (naturalWidth === 0) return

    const hRatio = finalDimensions.width / naturalWidth
    const vRatio = finalDimensions.height / naturalHeight
    const ratio = Math.min(hRatio, vRatio)

    const drawWidth = naturalWidth * ratio
    const drawHeight = naturalHeight * ratio
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
    naturalWidth,
    naturalHeight,
    imageLoaded,
  ])

  const cursorStyle = isDrawingEnabled && currentPoints.length > 0 ? 'crosshair' : 'default'

  const resolveClimbType = useCallback((climbType: string | null | undefined): ClimbType => {
    if (climbType === 'deep_water_solo') {
      return 'deep-water-solo'
    }
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

  const showOverlay = mode !== 'browse' && !isDrawingEnabled && Boolean(selectedRouteId)

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

  const handleImageLoad = useCallback((width: number, height: number) => {
    setNaturalWidth(width)
    setNaturalHeight(height)
    setImageLoaded(true)
    setImageError(false)
  }, [])

  const handleImageError = useCallback(() => {
    setImageError(true)
    setImageLoaded(true)
  }, [])

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`} style={{ cursor: cursorStyle }}>
      <CanvasImage
        key={imageUrl}
        src={imageUrl}
        onImageLoad={handleImageLoad}
        onImageError={handleImageError}
      />

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
          className="absolute z-10"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onMouseDown={handleMouseDown}
        />

      {showOverlay ? (
        <RouteCanvasOverlay
          overlayName={overlayName}
          overlayGradeLabel={overlayGradeLabel}
          overlayClimbTypeLabel={overlayClimbTypeLabel}
          isDrawingEnabled={isDrawingEnabled}
          onSelectName={() => handleOverlayIntent('name')}
          onSelectGrade={() => handleOverlayIntent('grade')}
          onSelectType={() => handleOverlayIntent('type')}
        />
      ) : null}

      {mode !== 'browse' && editorPanelOpen && <RouteEditSidebar />}
    </div>
  )
})
