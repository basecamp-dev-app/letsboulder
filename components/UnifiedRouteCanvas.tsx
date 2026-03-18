'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
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
  const zoomTransformRef = useRef(zoomTransform)

  useEffect(() => {
    zoomTransformRef.current = zoomTransform
  }, [zoomTransform])

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

    return {
      width,
      height,
      offsetX: (finalDimensions.width - width) / 2,
      offsetY: (finalDimensions.height - height) / 2,
    }
  }, [imageElement, finalDimensions])

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
      if (!canvas || !imageBounds) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top

      const logicalX = (screenX - zoomTransform.x) / zoomTransform.scale
      const logicalY = (screenY - zoomTransform.y) / zoomTransform.scale

      return toNormalizedCoords(
        logicalX,
        logicalY,
        imageBounds.width,
        imageBounds.height,
        imageBounds.offsetX,
        imageBounds.offsetY
      )
    },
    [imageBounds, zoomTransform]
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
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !finalDimensions) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = finalDimensions.width * dpr
    canvas.height = finalDimensions.height * dpr
    canvas.style.width = `${finalDimensions.width}px`
    canvas.style.height = `${finalDimensions.height}px`

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    ctx.translate(zoomTransformRef.current.x, zoomTransformRef.current.y)
    ctx.scale(zoomTransformRef.current.scale, zoomTransformRef.current.scale)

    let imageRenderProps = { x: 0, y: 0, width: finalDimensions.width, height: finalDimensions.height }

    if (imageElement && imageElement.naturalWidth > 0) {
      const hRatio = finalDimensions.width / imageElement.naturalWidth
      const vRatio = finalDimensions.height / imageElement.naturalHeight
      const ratio = Math.min(hRatio, vRatio)

      const drawWidth = imageElement.naturalWidth * ratio
      const drawHeight = imageElement.naturalHeight * ratio
      const centerX = (finalDimensions.width - drawWidth) / 2
      const centerY = (finalDimensions.height - drawHeight) / 2

      imageRenderProps = { x: centerX, y: centerY, width: drawWidth, height: drawHeight }

      ctx.drawImage(imageElement, centerX, centerY, drawWidth, drawHeight)
    }

    const routeCanvasDimensions = {
      width: imageRenderProps.width,
      height: imageRenderProps.height,
      offsetX: imageRenderProps.x,
      offsetY: imageRenderProps.y,
    }

    drawRoutes(
      ctx,
      routes,
      activeRouteId,
      currentPoints,
      routeCanvasDimensions,
      mode,
      interactionTool,
      zoomTransformRef.current
    )

    ctx.restore()
  }, [
    zoomTransform.x,
    zoomTransform.y,
    zoomTransform.scale,
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
