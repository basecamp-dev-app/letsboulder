'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import Link from 'next/link'

interface FaceSlide {
  id: string
  is_primary: boolean
  url: string
  has_routes: boolean
  crag_image_id: string | null
}

interface FaceSwipeGalleryProps {
  faces: FaceSlide[]
  isOwner: boolean
}

export default function FaceSwipeGallery({ faces, isOwner }: FaceSwipeGalleryProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
    loop: false,
  })
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateScrollState = useCallback(() => {
    if (!emblaApi) return
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const rafId = window.requestAnimationFrame(() => {
      updateScrollState()
    })
    emblaApi.on('select', updateScrollState)
    emblaApi.on('reInit', updateScrollState)
    return () => {
      window.cancelAnimationFrame(rafId)
      emblaApi.off('select', updateScrollState)
      emblaApi.off('reInit', updateScrollState)
    }
  }, [emblaApi, updateScrollState])

  const scrollTo = useCallback((index: number) => {
    if (!emblaApi) return
    emblaApi.scrollTo(index)
  }, [emblaApi])

  const scrollPrev = useCallback(() => {
    if (!emblaApi || !canScrollPrev) return
    emblaApi.scrollPrev()
  }, [emblaApi, canScrollPrev])

  const scrollNext = useCallback(() => {
    if (!emblaApi || !canScrollNext) return
    emblaApi.scrollNext()
  }, [emblaApi, canScrollNext])

  if (faces.length <= 1) return null

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Faces</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Swipe to browse</p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={scrollPrev}
          disabled={!canScrollPrev}
          aria-label="Previous face"
          className="absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition disabled:cursor-not-allowed disabled:opacity-35 md:flex"
        >
          {'<'}
        </button>
        <button
          type="button"
          onClick={scrollNext}
          disabled={!canScrollNext}
          aria-label="Next face"
          className="absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition disabled:cursor-not-allowed disabled:opacity-35 md:flex"
        >
          {'>'}
        </button>

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800" ref={emblaRef}>
          <div className="flex">
            {faces.map((face) => (
              <div key={face.id} className="relative min-w-0 shrink-0 grow-0 basis-[85%] sm:basis-[60%]">
                <div className="relative h-44 w-full bg-gray-100 dark:bg-gray-900">
                  <Image
                    src={face.url}
                    alt={face.is_primary ? 'Primary face' : 'Supplementary face'}
                    fill
                    sizes="(max-width: 768px) 85vw, 60vw"
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {face.is_primary ? 'Primary' : 'Face'}
                  </div>
                  {!face.has_routes && !face.is_primary ? (
                    <div className="absolute bottom-2 left-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                      No routes yet
                    </div>
                  ) : null}
                </div>

                {isOwner && !face.has_routes && !face.is_primary ? (
                  <div className="border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                    Add routes to this face in{' '}
                    <Link href="/submit" className="font-semibold text-blue-700 underline dark:text-blue-300">
                      Submit
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {faces.map((face, index) => (
          <button
            key={face.id}
            type="button"
            onClick={() => scrollTo(index)}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
            aria-label={`Go to face ${index + 1}`}
          >
            <Image
              src={face.url}
              alt="Face thumbnail"
              fill
              sizes="56px"
              unoptimized
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
