import { useState, useEffect, useRef, useCallback } from 'react'
import type { CanvasDimensions } from '@/types/domain'

export function useCanvasResize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  imageUrl: string
) {
  const [dimensions, setDimensions] = useState<CanvasDimensions | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const prevImageUrlRef = useRef<string | null>(null)

  const setupDimensions = useCallback(() => {
    const container = containerRef.current
    console.log('[DEBUG useCanvasResize] setupDimensions called', { 
      hasContainer: !!container 
    })
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    console.log('[DEBUG useCanvasResize] container dimensions:', { 
      containerWidth, 
      containerHeight 
    })

    if (containerWidth === 0 || containerHeight === 0) {
      console.log('[DEBUG useCanvasResize] container has no dimensions, returning early')
      return
    }

    const img = imageRef.current
    console.log('[DEBUG useCanvasResize] image ref:', { 
      hasImg: !!img,
      naturalWidth: img?.naturalWidth,
      naturalHeight: img?.naturalHeight
    })
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return

    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    const naturalAspect = naturalWidth / naturalHeight
    const containerAspect = containerWidth / containerHeight

    let displayedWidth: number
    let displayedHeight: number

    if (naturalAspect > containerAspect) {
      displayedWidth = containerWidth
      displayedHeight = containerWidth / naturalAspect
    } else {
      displayedHeight = containerHeight
      displayedWidth = containerHeight * naturalAspect
    }

    console.log('[DEBUG useCanvasResize] setting dimensions:', {
      width: displayedWidth,
      height: displayedHeight,
      naturalWidth,
      naturalHeight
    })

    setDimensions({
      width: displayedWidth,
      height: displayedHeight,
      naturalWidth,
      naturalHeight,
    })
  }, [containerRef])

  const handleImageLoad = useCallback(() => {
    console.log('[DEBUG useCanvasResize] image loaded!')
    setImageLoaded(true)
    setupDimensions()
  }, [setupDimensions])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      setupDimensions()
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [containerRef, setupDimensions])

  useEffect(() => {
    console.log('[DEBUG useCanvasResize] useEffect triggered', { 
      imageUrl, 
      prevUrl: prevImageUrlRef.current,
      shouldRun: imageUrl && imageUrl !== prevImageUrlRef.current
    })
    
    if (!imageUrl || imageUrl === prevImageUrlRef.current) return
    prevImageUrlRef.current = imageUrl

    console.log('[DEBUG useCanvasResize] creating new Image, src:', imageUrl)

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    imageRef.current = img

    const handleError = () => {
      console.log('[DEBUG useCanvasResize] image error!')
      setImageError(true)
    }

    img.addEventListener('load', handleImageLoad)
    img.addEventListener('error', handleError)
    img.src = imageUrl

    return () => {
      img.removeEventListener('load', handleImageLoad)
      img.removeEventListener('error', handleError)
      img.src = ''
    }
  }, [imageUrl, handleImageLoad])

  return {
    dimensions,
    imageLoaded,
    imageError,
  }
}
