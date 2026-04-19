'use client'

import Link from 'next/link'
import type { SelectedPinImage } from '@/features/crags/lib/crag-page-types'

interface SelectedPinImageTrayProps {
  images: SelectedPinImage[]
}

export default function SelectedPinImageTray({ images }: SelectedPinImageTrayProps) {
  if (images.length === 0) return null

  // Keep the selected pin tray readable when a location has many images.
  const allWithoutRoutes = images.every((image) => !image.hasRoutes)

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
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

        <div className="flex gap-3 overflow-x-auto pb-1">
          {images.map((image) => (
            <Link
              key={image.id}
              href={image.href}
              prefetch={false}
              className={`min-w-[11rem] max-w-[11rem] overflow-hidden rounded-2xl border transition-colors ${image.isSelected ? 'border-blue-500 ring-2 ring-blue-200 dark:border-blue-400 dark:ring-blue-900/60' : 'border-stone-200 hover:border-stone-300 dark:border-gray-800 dark:hover:border-gray-700'}`}
            >
              <div className="aspect-[4/3] bg-stone-100 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="Selected pin image" className="h-full w-full object-cover" loading="lazy" />
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
          ))}
        </div>
      </div>
    </section>
  )
}
