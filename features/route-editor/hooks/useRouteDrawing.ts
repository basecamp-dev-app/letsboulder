import { useCallback } from 'react'
import { useRouteStore } from '@/features/route-editor/store'
import type { RoutePoint } from '@/types/domain'

export function useRouteDrawing(options?: { disableRouteHistory?: boolean }) {
  const { currentPoints, addCurrentPoint, setCurrentPoints, clearCurrentPoints, interactionTool, commitToHistory } =
    useRouteStore()
  const disableRouteHistory = options?.disableRouteHistory === true

  const isDrawingEnabled = interactionTool === 'draw'

  const startDrawing = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled) return
      if (!disableRouteHistory) {
        commitToHistory()
      }
      setCurrentPoints([point])
    },
    [disableRouteHistory, isDrawingEnabled, commitToHistory, setCurrentPoints]
  )

  const continueDrawing = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled || currentPoints.length === 0) return
      addCurrentPoint(point)
    },
    [isDrawingEnabled, currentPoints.length, addCurrentPoint]
  )

  const finishDrawing = useCallback(() => {
    if (!isDrawingEnabled || currentPoints.length < 2) {
      clearCurrentPoints()
      return false
    }
    return true
  }, [isDrawingEnabled, currentPoints.length, clearCurrentPoints])

  const cancelDrawing = useCallback(() => {
    clearCurrentPoints()
  }, [clearCurrentPoints])

  const addPoint = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled) return
      if (currentPoints.length === 0) {
        startDrawing(point)
      } else {
        addCurrentPoint(point)
      }
    },
    [isDrawingEnabled, currentPoints.length, startDrawing, addCurrentPoint]
  )

  return {
    currentPoints,
    isDrawingEnabled,
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
    addPoint,
    clearCurrentPoints,
  }
}
