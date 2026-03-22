import { useState, useEffect, useCallback, useRef } from 'react'

import { uploadDebug } from '@/lib/media/upload-debug'

function shouldUseAnonymousCrossOrigin(imageUrl: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    const resolvedUrl = new URL(imageUrl, window.location.origin)
    return resolvedUrl.origin !== window.location.origin
  } catch {
    return false
  }
}

export const useCanvasResize = (imageUrl: string) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null)
  const loadGenerationRef = useRef(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setContainerNode(node)
    }
  }, [])

  useEffect(() => {
    if (!imageUrl) return

    const generation = ++loadGenerationRef.current
    setImageLoaded(false)
    setImageError(false)

    uploadDebug('canvas-debug-load-start', {
      imageUrl,
    })

    const img = new window.Image()
    const usesAnonymousCrossOrigin = shouldUseAnonymousCrossOrigin(imageUrl)
    if (usesAnonymousCrossOrigin) {
      img.crossOrigin = 'anonymous'
    }
    img.decoding = 'async'

    img.onload = () => {
      if (loadGenerationRef.current !== generation) return
      uploadDebug('canvas-debug-load-success', {
        imageUrl,
        usesAnonymousCrossOrigin,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })
      setImageElement(img)
      setImageLoaded(true)
    }

    img.onerror = () => {
      if (loadGenerationRef.current !== generation) return
      uploadDebug('canvas-debug-load-error', {
        imageUrl,
        usesAnonymousCrossOrigin,
      })
      setImageError(true)
      setImageLoaded(true)
    }

    img.src = imageUrl
    if (typeof img.decode === 'function') {
      void img.decode().catch(() => {
        // Fall back to onload/onerror handling when decode is unavailable or fails.
      })
    }

    return () => {
      // Intentionally mutate ref to invalidate stale onload/onerror callbacks
      /* eslint-disable react-hooks/exhaustive-deps */
      if (loadGenerationRef.current === generation) {
        loadGenerationRef.current++
      }
      /* eslint-enable react-hooks/exhaustive-deps */
    }
  }, [imageUrl])

  useEffect(() => {
    uploadDebug('canvas-debug-state', {
      imageUrl,
      imageLoaded,
      imageError,
    })
  }, [imageError, imageLoaded, imageUrl])

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

  return { containerRef, dimensions, imageElement, imageLoaded, imageError }
}
