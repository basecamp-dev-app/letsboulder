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

  const setupDimensions = useCallback((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect()
    const container = containerRef.current
    if (!container || rect.width === 0 || rect.height === 0) return

    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

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

    setDimensions({
      width: displayedWidth,
      height: displayedHeight,
      naturalWidth,
      naturalHeight,
    })
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (imageRef.current) {
        setupDimensions(imageRef.current)
      }
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [containerRef, setupDimensions])

  useEffect(() => {
    if (!imageUrl || imageUrl === prevImageUrlRef.current) return
    prevImageUrlRef.current = imageUrl

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    imageRef.current = img

    const handleLoad = () => {
      setImageLoaded(true)
      setupDimensions(img)
    }

    const handleError = () => {
      setImageError(true)
    }

    img.addEventListener('load', handleLoad)
    img.addEventListener('error', handleError)
    img.src = imageUrl

    return () => {
      img.removeEventListener('load', handleLoad)
      img.removeEventListener('error', handleError)
      img.src = ''
    }
  }, [imageUrl, setupDimensions])

  return {
    dimensions,
    imageLoaded,
    imageError,
  }
}
