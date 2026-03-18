'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouteStore } from '@/store/routeStore'
import { useCanvasResize } from '@/hooks/useCanvasResize'
import { usePanZoom } from '@/hooks/usePanZoom'
import { useRouteDrawing } from '@/hooks/useRouteDrawing'
import { useHitTesting } from '@/hooks/useHitTesting'
import { drawRoutes } from '@/lib/routeRenderer'
import { RouteEditSidebar } from '@/components/RouteEditSidebar'
import type { CanvasMode, RouteLine } from '@/types/domain'

interface UnifiedRouteCanvasProps {
  mode: CanvasMode
  imageUrl: string
  routes?: RouteLine[]
  onRouteSelect?: (routeId: string | null) => void
  onRoutesUpdate?: (routes: RouteLine[]) => void
  className?: string
}

export function UnifiedRouteCanvas({
  mode,
  imageUrl,
  routes: propRoutes,
  onRouteSelect,
  onRoutesUpdate,
  className = '',
}: UnifiedRouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    routes: storeRoutes,
    setRoutes,
    activeRouteId,
    currentPoints,
    interactionTool,
    selectedRouteId,
  } = useRouteStore()

  const routes = propRoutes || storeRoutes

  useEffect(() => {
    if (propRoutes) {
      setRoutes(propRoutes)
    }
  }, [propRoutes, setRoutes])

  const { containerRef, dimensions, imageElement, imageLoaded, imageError } = useCanvasResize(imageUrl)

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

  const { handleRouteClick } = useHitTesting()

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
          handleRouteClick(point)
          const clickedRouteId = activeRouteId
          if (onRouteSelect) {
            onRouteSelect(clickedRouteId)
          }
        }
      }
    },
    [getCanvasPoint, isDrawingEnabled, addPoint, handleRouteClick, activeRouteId, onRouteSelect]
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
      activeRouteId,
      currentPoints,
      routeCanvasDimensions,
      mode,
      interactionTool
    )

    ctx.restore()
  }, [
    routes,
    activeRouteId,
    currentPoints,
    finalDimensions,
    mode,
    interactionTool,
    imageElement
  ])

  useEffect(() => {
    if (onRoutesUpdate) {
      onRoutesUpdate(routes)
    }
  }, [routes, onRoutesUpdate])

  const cursorStyle = isDrawingEnabled && currentPoints.length > 0 ? 'crosshair' : 'default'

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

      {selectedRouteId && mode === 'submit' && <RouteEditSidebar />}
    </div>
  )
}
