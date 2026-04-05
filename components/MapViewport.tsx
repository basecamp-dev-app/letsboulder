'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { PlacePin } from '@/lib/map/place-pins'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapViewportFallback />,
})

function MapViewportFallback() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_42%),linear-gradient(180deg,_rgba(2,6,23,0.8),_rgba(2,6,23,0.72))]">
      <div className="flex h-full items-start justify-center px-4 pt-20 sm:px-6 md:items-center md:pt-0">
        <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 text-white shadow-2xl shadow-slate-950/40 backdrop-blur md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">letsboulder</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Climbing map and photo topos
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-200 sm:text-base">
            Browse climbing areas, route beta, and community updates while the full interactive map loads.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/logbook"
              className="inline-flex items-center rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-300"
            >
              Open logbook
            </Link>
            <Link
              href="/submit"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Upload topo
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MapViewport({ initialPlacePins = [] }: { initialPlacePins?: PlacePin[] }) {
  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      <MapViewportFallback />
      <SatelliteClimbingMap initialPlacePins={initialPlacePins} />
    </div>
  )
}
