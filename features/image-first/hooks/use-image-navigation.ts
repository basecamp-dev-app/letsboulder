'use client'

import { useEffect, useMemo } from 'react'
import useEmblaCarousel from 'embla-carousel-react'

export function useImageNavigation({
  orderedImageIds,
  startIndex,
  selectedImageId,
  onActiveImageIndexChange,
  linkedImageIdByDisplayId,
  stacks,
  sectorMarkers,
}: {
  orderedImageIds: string[]
  startIndex: number
  selectedImageId: string | null
  onActiveImageIndexChange: (index: number) => void
  linkedImageIdByDisplayId: Record<string, string>
  stacks: Array<{ stackId: string; imageIds: string[] }>
  sectorMarkers: Record<string, { name: string; firstImageId: string }>
}) {
  const activeImageIndex = Math.max(
    0,
    orderedImageIds.indexOf(selectedImageId || '') >= 0
      ? orderedImageIds.indexOf(selectedImageId || '')
      : Math.min(startIndex, orderedImageIds.length - 1)
  )
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
      if (nextIndex !== activeImageIndex) onActiveImageIndexChange(nextIndex)
    }

    emblaApi.on('select', handleSelect)
    return () => {
      emblaApi.off('select', handleSelect)
    }
  }, [activeImageIndex, emblaApi, onActiveImageIndexChange])

  return {
    activeImageIndex,
    activeImageId,
    canonicalActiveImageId,
    activeSector,
    activeStack,
    emblaApi,
    emblaRef,
    setActiveImageIndex: onActiveImageIndexChange,
    isFirst: activeImageIndex === 0,
    isLast: activeImageIndex === orderedImageIds.length - 1,
  }
}
