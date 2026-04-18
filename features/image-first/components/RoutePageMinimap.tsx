'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LightweightCragMap from '@/components/LightweightCragMap'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'

const ROUTE_PAGE_ZOOM = 18
const ENHANCE_DELAY_MS = 500
const VIEWPORT_PADDING_FACTOR = 0.3

interface RoutePageMinimapProps {
  cragId: string | null
  currentPin: LightweightCragMapPin | null
  activeImageId: string | null
  orderedImageIds: string[]
  onPinSelect: (imageId: string) => void
}

interface BoundsState {
  north: number
  south: number
  east: number
  west: number
}

function expandBounds(bounds: BoundsState): BoundsState {
  const latitudePadding = (bounds.north - bounds.south) * VIEWPORT_PADDING_FACTOR
  const longitudePadding = (bounds.east - bounds.west) * VIEWPORT_PADDING_FACTOR
  return {
    north: Math.min(90, bounds.north + latitudePadding),
    south: Math.max(-90, bounds.south - latitudePadding),
    east: Math.min(180, bounds.east + longitudePadding),
    west: Math.max(-180, bounds.west - longitudePadding),
  }
}

function boundsContain(container: BoundsState, target: BoundsState) {
  return container.north >= target.north
    && container.south <= target.south
    && container.east >= target.east
    && container.west <= target.west
}

export default function RoutePageMinimap({
  cragId,
  currentPin,
  activeImageId,
  orderedImageIds,
  onPinSelect,
}: RoutePageMinimapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const enhanceTimerRef = useRef<number | null>(null)
  const fetchTimerRef = useRef<number | null>(null)
  const cachedBoundsRef = useRef<BoundsState[]>([])
  const [isInView, setIsInView] = useState(false)
  const [isEnhanced, setIsEnhanced] = useState(false)
  const [showUnlockHint, setShowUnlockHint] = useState(true)
  const [pinsById, setPinsById] = useState<Record<string, LightweightCragMapPin>>(() => {
    if (!currentPin) return {}
    return { [currentPin.id]: currentPin }
  })

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setIsInView(true)
        observer.disconnect()
      }
    }, { threshold: 0.2 })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isInView || isEnhanced) return
    enhanceTimerRef.current = window.setTimeout(() => {
      setIsEnhanced(true)
    }, ENHANCE_DELAY_MS)

    return () => {
      if (enhanceTimerRef.current !== null) {
        window.clearTimeout(enhanceTimerRef.current)
      }
    }
  }, [isEnhanced, isInView])

  const unlockMap = useCallback(() => {
    if (enhanceTimerRef.current !== null) {
      window.clearTimeout(enhanceTimerRef.current)
      enhanceTimerRef.current = null
    }
    setShowUnlockHint(false)
    setIsEnhanced(true)
  }, [])

  const fetchPinsForBounds = useCallback(async (bounds: BoundsState) => {
    if (!cragId) return
    const paddedBounds = expandBounds(bounds)
    if (cachedBoundsRef.current.some((cachedBounds) => boundsContain(cachedBounds, paddedBounds))) {
      return
    }

    const params = new URLSearchParams({
      cragId,
      north: String(paddedBounds.north),
      south: String(paddedBounds.south),
      east: String(paddedBounds.east),
      west: String(paddedBounds.west),
    })
    const response = await fetch(`/api/image-first/pins?${params.toString()}`)
    if (!response.ok) return

    const json = await response.json() as {
      pins?: Array<{ imageId: string; latitude: number; longitude: number; activeImageIds: string[] }>
    }

    cachedBoundsRef.current.push(paddedBounds)
    setPinsById((currentPins) => {
      const nextPins = { ...currentPins }
      for (const pin of json.pins || []) {
        nextPins[pin.imageId] = {
          id: pin.imageId,
          latitude: pin.latitude,
          longitude: pin.longitude,
          activeImageIds: pin.activeImageIds,
          label: String((pin.activeImageIds || []).length || 1),
        }
      }
      return nextPins
    })
  }, [cragId])

  const handleViewportChange = useCallback((state: { zoom: number; bounds: BoundsState }) => {
    void state.zoom
    if (fetchTimerRef.current !== null) {
      window.clearTimeout(fetchTimerRef.current)
    }
    fetchTimerRef.current = window.setTimeout(() => {
      void fetchPinsForBounds(state.bounds)
    }, 200)
  }, [fetchPinsForBounds])

  useEffect(() => {
    return () => {
      if (fetchTimerRef.current !== null) {
        window.clearTimeout(fetchTimerRef.current)
      }
      if (enhanceTimerRef.current !== null) {
        window.clearTimeout(enhanceTimerRef.current)
      }
    }
  }, [])

  const initialCenter = currentPin ? [currentPin.latitude, currentPin.longitude] as [number, number] : null
  const orderedPins = useMemo(() => {
    return orderedImageIds
      .map((imageId) => pinsById[imageId])
      .filter((pin): pin is LightweightCragMapPin => Boolean(pin))
  }, [orderedImageIds, pinsById])

  if (!currentPin || !initialCenter) return null

  return (
    <div ref={containerRef}>
      {isEnhanced ? (
        <LightweightCragMap
          pins={orderedPins}
          activePinId={activeImageId}
          initialCenter={initialCenter}
          initialZoom={ROUTE_PAGE_ZOOM}
          onPinSelect={onPinSelect}
          disableClustering={true}
          disableAutoFit={true}
          onViewportChange={handleViewportChange}
          heightClassName="min-h-[240px] md:min-h-[280px]"
        />
      ) : (
        <button
          type="button"
          onClick={unlockMap}
          className="group relative block w-full text-left"
          aria-label="Tap map to explore nearby photos"
        >
          <LightweightCragMap
            pins={[currentPin]}
            activePinId={activeImageId}
            initialCenter={initialCenter}
            initialZoom={ROUTE_PAGE_ZOOM}
            staticPreview={true}
            disableAutoFit={true}
            heightClassName="min-h-[240px] md:min-h-[280px]"
          />
          {showUnlockHint ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-black/65 px-4 py-3 text-sm font-medium text-white backdrop-blur-sm">
              Tap map to explore nearby photos
            </div>
          ) : null}
        </button>
      )}
    </div>
  )
}
