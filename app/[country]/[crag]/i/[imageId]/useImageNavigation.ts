'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useEmblaCarousel from 'embla-carousel-react'

import type { ImageFirstRouteLine } from '@/app/[country]/[crag]/i/[imageId]/image-page-server'

export function useImageNavigation({
  orderedImageIds,
  startIndex,
  initialRoutes,
  initialRouteId,
  initialRouteSlug,
  initialClimbId,
  countryCode,
  cragSlug,
  stacks,
  sectorMarkers,
}: {
  orderedImageIds: string[]
  startIndex: number
  initialRoutes: ImageFirstRouteLine[]
  initialRouteId?: string | null
  initialRouteSlug?: string | null
  initialClimbId?: string | null
  countryCode: string
  cragSlug: string
  stacks: Array<{ stackId: string; imageIds: string[] }>
  sectorMarkers: Record<string, { name: string; firstImageId: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [activeImageIndex, setActiveImageIndex] = useState(startIndex)
  const [userSelectedRouteId, setUserSelectedRouteId] = useState<string | null>(null)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    startIndex,
  })

  const activeImageId = orderedImageIds[activeImageIndex] || null

  const activeRouteId = useMemo(() => {
    if (!activeImageId) return null

    if (userSelectedRouteId && initialRoutes.some((route) => route.routeId === userSelectedRouteId)) {
      return userSelectedRouteId
    }

    const routeQuery = searchParams.get('route') || initialRouteSlug || initialRouteId
    if (routeQuery) {
      const slugMatch = initialRoutes.find((route) => route.climbSlug === routeQuery)
      if (slugMatch) return slugMatch.routeId

      if (initialRoutes.some((route) => route.routeId === routeQuery)) {
        return routeQuery
      }
    }

    const climbQueryId = searchParams.get('climb') || initialClimbId
    if (climbQueryId) {
      const match = initialRoutes.find((route) => route.climbId === climbQueryId)
      if (match) return match.routeId
    }

    return initialRoutes[0]?.routeId || null
  }, [activeImageId, initialClimbId, initialRouteId, initialRouteSlug, initialRoutes, searchParams, userSelectedRouteId])

  const activeClimbId = useMemo(() => {
    if (!activeRouteId) return null
    return initialRoutes.find((route) => route.routeId === activeRouteId)?.climbId || null
  }, [activeRouteId, initialRoutes])

  const activeStack = useMemo(
    () => stacks.find((stack) => stack.imageIds.includes(activeImageId || '')) || null,
    [activeImageId, stacks]
  )

  const activeSector = useMemo(
    () => Object.values(sectorMarkers).find((marker) => orderedImageIds.indexOf(marker.firstImageId) <= activeImageIndex)
      || null,
    [activeImageIndex, orderedImageIds, sectorMarkers]
  )

  useEffect(() => {
    if (!emblaApi) return
    if (emblaApi.selectedScrollSnap() !== activeImageIndex) {
      emblaApi.scrollTo(activeImageIndex, true)
    }

    const handleSelect = () => {
      const nextIndex = emblaApi.selectedScrollSnap()
      setActiveImageIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex))
    }

    emblaApi.on('select', handleSelect)
    return () => {
      emblaApi.off('select', handleSelect)
    }
  }, [activeImageIndex, emblaApi])

  useEffect(() => {
    if (!activeImageId) return

    const currentPathImageId = pathname.split('/').pop()
    if (currentPathImageId === activeImageId) return

    const newPath = `/${countryCode}/${cragSlug}/i/${activeImageId}`
    const params = new URLSearchParams(searchParams.toString())
    params.delete('climb')

    if (activeRouteId) {
      const activeRoute = initialRoutes.find((route) => route.routeId === activeRouteId)
      if (activeRoute?.climbSlug) {
        params.set('route', activeRoute.climbSlug)
      } else {
        params.set('route', activeRouteId)
      }
    } else {
      params.delete('route')
    }

    router.replace(`${newPath}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }, [activeClimbId, activeImageId, activeRouteId, countryCode, cragSlug, initialRoutes, pathname, router, searchParams])

  return {
    activeImageIndex,
    activeImageId,
    activeRouteId,
    activeClimbId,
    activeSector,
    activeStack,
    emblaApi,
    emblaRef,
    setActiveImageIndex,
    setUserSelectedRouteId,
    isFirst: activeImageIndex === 0,
    isLast: activeImageIndex === orderedImageIds.length - 1,
  }
}
