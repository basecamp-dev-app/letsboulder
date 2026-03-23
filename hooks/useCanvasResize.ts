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

export const useCanvasResize = (imageUrl: string, preloadedImage?: HTMLImageElement | null) => {
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
    if (preloadedImage && preloadedImage.complete && preloadedImage.naturalWidth > 0) {
      setImageElement(preloadedImage)
      setImageLoaded(true)
      setImageError(false)
      uploadDebug('canvas-using-preloaded', {
        imageUrl,
        naturalWidth: preloadedImage.naturalWidth,
        naturalHeight: preloadedImage.naturalHeight,
      })
      return
    }
  }, [preloadedImage, imageUrl])

  useEffect(() => {
    if (!imageUrl || preloadedImage) return

    const generation = ++loadGenerationRef.current
    setImageLoaded(false)
    setImageError(false)

    uploadDebug('canvas-debug-load-start', {
      imageUrl,
    })

    console.log('[CanvasResize] Loading:', imageUrl)

    const img = new window.Image()
    img.decoding = 'async'

    img.onload = () => {
      if (loadGenerationRef.current !== generation) return
      console.log('[CanvasResize] Loaded:', imageUrl, { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
      uploadDebug('canvas-debug-load-success', {
        imageUrl,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })
      setImageElement(img)
      setImageLoaded(true)
    }

    img.onerror = () => {
      if (loadGenerationRef.current !== generation) return
      console.log('[CanvasResize] Error loading:', imageUrl)
      uploadDebug('canvas-debug-load-error', {
        imageUrl,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
