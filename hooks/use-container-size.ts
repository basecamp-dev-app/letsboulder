import { useState, useEffect, useCallback } from 'react'

export function useContainerSize() {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setContainerNode(node)
    }
  }, [])

  useEffect(() => {
    if (!containerNode) return

    const updateDimensions = () => {
      setDimensions({
        width: containerNode.clientWidth,
        height: containerNode.clientHeight,
      })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerNode)

    return () => resizeObserver.disconnect()
  }, [containerNode])

  return { containerRef, dimensions }
}
