import { useCallback } from 'react'

export function usePanZoom() {
  const startPan = useCallback(() => {}, [])
  const updatePan = useCallback(() => {}, [])
  const endPan = useCallback(() => {}, [])
  const startPinch = useCallback(() => {}, [])
  const updatePinch = useCallback(() => {}, [])
  const endPinch = useCallback(() => {}, [])
  const zoomToPoint = useCallback(() => {}, [])
  const resetZoom = useCallback(() => ({ x: 0, y: 0 }), [])

  return {
    isPanning: false,
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
