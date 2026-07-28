'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { SelectedPinImage } from '@/features/crags/lib/crag-page-types'
import { buildThumbnailUrl } from '@/lib/media/thumbnail-url'

interface SelectedPinImageTrayProps {
  images: SelectedPinImage[]
}

export default function SelectedPinImageTray({ images }: SelectedPinImageTrayProps) {
  if (images.length === 0) return null

  // Keep the selected pin tray readable when a location has many images.
  const allWithoutRoutes = images.every((image) => !image.hasRoutes)

  return (
    <section className="mx-auto max-w-[90rem] px-4 pt-3 lg:pt-4">
      <div className="rounded-[28px] border border-stone-200/90 bg-white p-4 shadow-sm shadow-stone-950/5 dark:border-gray-800 dark:bg-gray-900 lg:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900 dark:text-gray-100">Images at this pin</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-gray-400">
              {allWithoutRoutes
                ? 'No topo yet. Open an image to add route data.'
                : 'Choose an image to inspect the topo or add missing route data.'}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-gray-800 dark:text-gray-300">
            {images.length} image{images.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 lg:gap-4">
          {images.map((image) => (
            <TrayImageCard key={image.id} image={image} />
          ))}
        </div>
      </div>
    </section>
  )
}

function TrayImageCard({ image }: { image: SelectedPinImage }) {
  const [loaded, setLoaded] = useState(false)
  const thumbnailUrl = buildThumbnailUrl(image.url, 480, 70, { storageUrl: image.storageUrl })

  return (
    <Link
      href={image.href}
      prefetch={false}
      className={`group min-w-[11rem] max-w-[11rem] overflow-hidden rounded-[24px] border bg-white/90 transition-all duration-200 ${image.isSelected ? 'border-blue-500 ring-2 ring-blue-200 shadow-md shadow-blue-100/80 dark:border-blue-400 dark:ring-blue-900/60 dark:shadow-blue-950/40' : 'border-stone-200/90 hover:border-stone-300 hover:shadow-md hover:shadow-stone-950/5 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-gray-800">
        <div className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03),rgba(255,255,255,0.14))] transition-opacity duration-300 dark:bg-[linear-gradient(110deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02),rgba(255,255,255,0.08))] ${loaded ? 'opacity-0' : 'animate-pulse opacity-100'}`} />
        <Image
          src={thumbnailUrl}
          alt="Selected pin image"
          fill
          loading="lazy"
          sizes="(max-width: 1024px) 176px, 192px"
          className={`object-cover transition duration-500 ${loaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0'}`}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-stone-900 dark:text-gray-100">
            {image.routeLinesCount} route{image.routeLinesCount === 1 ? '' : 's'}
          </span>
          {!image.hasRoutes ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              No topo yet
            </span>
          ) : null}
        </div>
        <p className="text-xs text-stone-600 dark:text-gray-400">
          {image.hasRoutes ? 'Open image' : 'Open to add routes'}
        </p>
      </div>
    </Link>
  )
}
