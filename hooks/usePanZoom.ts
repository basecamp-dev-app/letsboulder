import { useCallback, useRef, useState } from 'react'
import { useRouteStore } from '@/store/routeStore'
import type { RoutePoint } from '@/types/domain'

interface UsePanZoomOptions {
  minScale?: number
  maxScale?: number
}

export function usePanZoom(options: UsePanZoomOptions = {}) {
  const { minScale = 0.5, maxScale = 5 } = options

  const { zoomTransform, updateZoomTransform } = useRouteStore()

  const [isPanning, setIsPanning] = useState(false)
  const lastPanPoint = useRef<RoutePoint>({ x: 0, y: 0 })
  const pinchStartZoom = useRef<number | null>(null)
  const pinchStartDistance = useRef<number | null>(null)
  const pinchCenter = useRef<RoutePoint | null>(null)

  const startPan = useCallback((clientX: number, clientY: number) => {
    setIsPanning(true)
    lastPanPoint.current = { x: clientX, y: clientY }
  }, [])

  const updatePan = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPanning) return

      const dx = clientX - lastPanPoint.current.x
      const dy = clientY - lastPanPoint.current.y

      updateZoomTransform({
        x: zoomTransform.x + dx,
        y: zoomTransform.y + dy,
      })

      lastPanPoint.current = { x: clientX, y: clientY }
    },
    [isPanning, zoomTransform, updateZoomTransform]
  )

  const endPan = useCallback(() => {
    setIsPanning(false)
  }, [])

  const startPinch = useCallback(
    (touches: TouchList) => {
      if (touches.length !== 2) return

      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      const distance = Math.hypot(dx, dy)
      const centerX = (touches[0].clientX + touches[1].clientX) / 2
      const centerY = (touches[0].clientY + touches[1].clientY) / 2

      pinchStartZoom.current = zoomTransform.scale
      pinchStartDistance.current = distance
      pinchCenter.current = { x: centerX, y: centerY }
    },
    [zoomTransform.scale]
  )

  const updatePinch = useCallback(
    (touches: TouchList) => {
      if (
        touches.length !== 2 ||
        pinchStartZoom.current === null ||
        pinchStartDistance.current === null ||
        !pinchCenter.current
      ) {
        return
      }

      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      const distance = Math.hypot(dx, dy)
      const centerX = (touches[0].clientX + touches[1].clientX) / 2
      const centerY = (touches[0].clientY + touches[1].clientY) / 2

      const scale = Math.min(
        maxScale,
        Math.max(minScale, (distance / pinchStartDistance.current) * pinchStartZoom.current)
      )

      const scaleDiff = scale / zoomTransform.scale
      const newX = pinchCenter.current.x - (pinchCenter.current.x - zoomTransform.x) * scaleDiff
      const newY = pinchCenter.current.y - (pinchCenter.current.y - zoomTransform.y) * scaleDiff

      updateZoomTransform({
        x: newX,
        y: newY,
        scale,
      })

      pinchStartZoom.current = scale
      pinchStartDistance.current = distance
      pinchCenter.current = { x: centerX, y: centerY }
    },
    [minScale, maxScale, zoomTransform, updateZoomTransform]
  )

  const endPinch = useCallback(() => {
    pinchStartZoom.current = null
    pinchStartDistance.current = null
    pinchCenter.current = null
  }, [])

  const zoomToPoint = useCallback(
    (delta: number, pointX: number, pointY: number) => {
      const newScale = Math.min(
        maxScale,
        Math.max(minScale, zoomTransform.scale * (1 - delta))
      )

      const scaleDiff = newScale / zoomTransform.scale
      const newX = pointX - (pointX - zoomTransform.x) * scaleDiff
      const newY = pointY - (pointY - zoomTransform.y) * scaleDiff

      updateZoomTransform({
        x: newX,
        y: newY,
        scale: newScale,
      })
    },
    [zoomTransform, minScale, maxScale, updateZoomTransform]
  )

  const resetZoom = useCallback(() => {
    updateZoomTransform({ x: 0, y: 0, scale: 1 })
  }, [updateZoomTransform])

  return {
    isPanning,
    startPan,
    updatePan,
    endPan,
    startPinch,
    updatePinch,
    endPinch,
    zoomToPoint,
    resetZoom,
  }
}
