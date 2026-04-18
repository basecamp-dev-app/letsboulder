'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useEmblaCarousel from 'embla-carousel-react'

export function useImageNavigation({
  orderedImageIds,
  startIndex,
  linkedImageIdByDisplayId,
  countryCode,
  cragSlug,
  stacks,
  sectorMarkers,
}: {
  orderedImageIds: string[]
  startIndex: number
  linkedImageIdByDisplayId: Record<string, string>
  countryCode: string
  cragSlug: string
  stacks: Array<{ stackId: string; imageIds: string[] }>
  sectorMarkers: Record<string, { name: string; firstImageId: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [activeImageIndex, setActiveImageIndex] = useState(startIndex)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    startIndex,
  })

  const activeImageId = orderedImageIds[activeImageIndex] || null
  const canonicalActiveImageId = activeImageId ? linkedImageIdByDisplayId[activeImageId] || activeImageId : null

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
    if (!canonicalActiveImageId) return

    const currentPathImageId = pathname.split('/').pop()
    if (currentPathImageId === canonicalActiveImageId) return

    const newPath = `/${countryCode}/${cragSlug}/i/${canonicalActiveImageId}`
    const params = new URLSearchParams(searchParams.toString())
    params.delete('climb')
    router.replace(`${newPath}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }, [canonicalActiveImageId, countryCode, cragSlug, pathname, router, searchParams])

  return {
    activeImageIndex,
    activeImageId,
    canonicalActiveImageId,
    activeSector,
    activeStack,
    emblaApi,
    emblaRef,
    setActiveImageIndex,
    isFirst: activeImageIndex === 0,
    isLast: activeImageIndex === orderedImageIds.length - 1,
  }
}
