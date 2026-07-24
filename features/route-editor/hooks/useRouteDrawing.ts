import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore } from '@/features/route-editor/store'
import type { RoutePoint } from '@/types/domain'

export function useRouteDrawing() {
  const {
    currentPointsCount,
    addCurrentPoint,
    setCurrentPoints,
    clearCurrentPoints,
    interactionTool,
    commitToHistory,
  } = useRouteStore(useShallow((state) => ({
    currentPointsCount: state.currentPoints.length,
    addCurrentPoint: state.addCurrentPoint,
    setCurrentPoints: state.setCurrentPoints,
    clearCurrentPoints: state.clearCurrentPoints,
    interactionTool: state.interactionTool,
    commitToHistory: state.commitToHistory,
  })))

  const isDrawingEnabled = interactionTool === 'draw'

  const startDrawing = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled) return
      commitToHistory()
      setCurrentPoints([point])
    },
    [isDrawingEnabled, commitToHistory, setCurrentPoints]
  )

  const continueDrawing = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled || currentPointsCount === 0) return
      addCurrentPoint(point)
    },
    [isDrawingEnabled, currentPointsCount, addCurrentPoint]
  )

  const finishDrawing = useCallback(() => {
    if (!isDrawingEnabled || currentPointsCount < 2) {
      clearCurrentPoints()
      return false
    }
    return true
  }, [isDrawingEnabled, currentPointsCount, clearCurrentPoints])

  const cancelDrawing = useCallback(() => {
    clearCurrentPoints()
  }, [clearCurrentPoints])

  const addPoint = useCallback(
    (point: RoutePoint) => {
      if (!isDrawingEnabled) return
      if (currentPointsCount === 0) {
        startDrawing(point)
      } else {
        addCurrentPoint(point)
      }
    },
    [isDrawingEnabled, currentPointsCount, startDrawing, addCurrentPoint]
  )

  return {
    currentPointsCount,
    isDrawingEnabled,
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
    addPoint,
    clearCurrentPoints,
  }
}
