'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useRouteStore } from '@/store/routeStore'
import { useCanvasResize } from '@/hooks/useCanvasResize'
import { usePanZoom } from '@/hooks/usePanZoom'
import { useRouteDrawing } from '@/hooks/useRouteDrawing'
import { useHitTesting } from '@/hooks/useHitTesting'
import { drawRoutes } from '@/lib/routeRenderer'
import { screenToCanvasCoords, toNormalizedCoords } from '@/lib/canvasMath'
import type { CanvasMode, RouteLine, CanvasDimensions } from '@/types/domain'

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
    zoomTransform,
    interactionTool,
  } = useRouteStore()

  const routes = propRoutes || storeRoutes

  useEffect(() => {
    if (propRoutes) {
      setRoutes(propRoutes)
    }
  }, [propRoutes, setRoutes])

  const { containerRef, dimensions, imageElement, imageLoaded, imageError } = useCanvasResize(imageUrl)

  const finalDimensions = dimensions

  console.log('[DEBUG UnifiedRouteCanvas]', { 
    imageUrl: imageUrl?.substring(0, 50), 
    dimensions: finalDimensions, 
    imageLoaded, 
    imageError,
    imageElement: imageElement ? { naturalWidth: imageElement.naturalWidth, naturalHeight: imageElement.naturalHeight } : null
  })

  const { isPanning, startPan, updatePan, endPan, startPinch, updatePinch, endPinch, zoomToPoint } =
    usePanZoom()

  const { isDrawingEnabled, addPoint } = useRouteDrawing()

  const { handleRouteClick } = useHitTesting()

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas || !finalDimensions) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      console.log('[DEBUG getCanvasPoint] raw coords:', { x, y, canvasRect: { width: rect.width, height: rect.height }, finalDimensions, zoomTransform })

      return toNormalizedCoords(x, y, finalDimensions.width, finalDimensions.height, zoomTransform)
    },
    [finalDimensions, zoomTransform]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      console.log('[DEBUG handleMouseDown] isDrawingEnabled:', isDrawingEnabled, 'button:', e.button, 'altKey:', e.altKey)
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        startPan(e.clientX, e.clientY)
        return
      }

      if (e.button === 0 && !e.altKey) {
        const point = getCanvasPoint(e.clientX, e.clientY)
        console.log('[DEBUG handleMouseDown] point:', point)

        if (isDrawingEnabled) {
          console.log('[DEBUG handleMouseDown] calling addPoint')
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
    [startPan, getCanvasPoint, isDrawingEnabled, addPoint, handleRouteClick, activeRouteId, onRouteSelect]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning) {
        updatePan(e.clientX, e.clientY)
      }
    },
    [isPanning, updatePan]
  )

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      endPan()
    }
  }, [isPanning, endPan])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 2) {
        startPinch(Array.from(e.touches) as unknown as TouchList)
        return
      }

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
    [startPinch, getCanvasPoint, isDrawingEnabled, addPoint, handleRouteClick]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 2) {
        updatePinch(Array.from(e.touches) as unknown as TouchList)
      }
    },
    [updatePinch]
  )

  const handleTouchEnd = useCallback(() => {
    endPinch()
  }, [endPinch])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const pointX = e.clientX - rect.left
      const pointY = e.clientY - rect.top

      const delta = e.deltaY > 0 ? 0.1 : -0.1
      zoomToPoint(delta, pointX, pointY)
    },
    [zoomToPoint]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !finalDimensions) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = finalDimensions.width * dpr
    canvas.height = finalDimensions.height * dpr
    canvas.style.width = `${finalDimensions.width}px`
    canvas.style.height = `${finalDimensions.height}px`

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(zoomTransform.x, zoomTransform.y)
    ctx.scale(zoomTransform.scale, zoomTransform.scale)

    if (imageElement && imageElement.naturalWidth > 0 && finalDimensions) {
      const hRatio = finalDimensions.width / imageElement.naturalWidth
      const vRatio = finalDimensions.height / imageElement.naturalHeight
      const ratio = Math.min(hRatio, vRatio)
      
      const centerShift_x = (finalDimensions.width - imageElement.naturalWidth * ratio) / 2
      const centerShift_y = (finalDimensions.height - imageElement.naturalHeight * ratio) / 2

      ctx.drawImage(
        imageElement,
        0, 0, imageElement.naturalWidth, imageElement.naturalHeight,
        centerShift_x, centerShift_y, imageElement.naturalWidth * ratio, imageElement.naturalHeight * ratio
      )
    }

    const canvasDimensions = finalDimensions && imageElement ? {
      width: finalDimensions.width,
      height: finalDimensions.height,
      naturalWidth: imageElement.naturalWidth,
      naturalHeight: imageElement.naturalHeight,
    } : null

    if (canvasDimensions) {
      drawRoutes(ctx, routes, activeRouteId, currentPoints, canvasDimensions, mode, interactionTool, zoomTransform)
    }

    ctx.restore()
  }, [routes, activeRouteId, currentPoints, finalDimensions, mode, interactionTool, zoomTransform, imageElement])

  useEffect(() => {
    if (onRoutesUpdate) {
      onRoutesUpdate(routes)
    }
  }, [routes, onRoutesUpdate])

  const cursorStyle =
    isPanning || (isDrawingEnabled && currentPoints.length > 0)
      ? 'grabbing'
      : isDrawingEnabled
        ? 'crosshair'
        : 'default'

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
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      />
    </div>
  )
}
