'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import { runWhenIdle } from '@/lib/run-when-idle'
import { cn } from '@/lib/utils'

const MapViewport = dynamic(() => import('@/components/MapViewport'), {
  ssr: false,
  loading: () => null,
})

interface HomeMapHeroProps {
  className?: string
}

function HomeMapPreview({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="group absolute inset-0 overflow-hidden bg-slate-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      aria-label="Load interactive climbing map"
    >
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_34%,rgba(244,114,182,0.26),transparent_28%),radial-gradient(circle_at_62%_54%,rgba(56,189,248,0.2),transparent_24%),linear-gradient(135deg,#020617_0%,#0f172a_46%,#1e293b_100%)]" />
      <div className="absolute left-[18%] top-[32%] h-3 w-3 rounded-full bg-pink-400 shadow-[0_0_0_8px_rgba(244,114,182,0.16)]" />
      <div className="absolute left-[48%] top-[42%] h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_0_8px_rgba(252,211,77,0.16)]" />
      <div className="absolute left-[70%] top-[29%] h-3 w-3 rounded-full bg-sky-300 shadow-[0_0_0_8px_rgba(125,211,252,0.16)]" />
      <div className="absolute left-[58%] top-[66%] h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_0_8px_rgba(110,231,183,0.16)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950 via-slate-950/62 to-transparent" />
      <div className="absolute bottom-8 left-4 max-w-sm rounded-3xl border border-white/12 bg-slate-950/72 p-4 text-white shadow-2xl backdrop-blur md:left-8 md:bottom-10 md:p-5">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/82">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Climbing map
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Find rock, gyms, and topos near you.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">Tap to load the interactive map.</p>
      </div>
      <span className="absolute right-4 bottom-8 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl transition group-hover:bg-pink-50 md:right-8 md:bottom-10">
        Explore map
      </span>
    </button>
  )
}

export default function HomeMapHero({ className }: HomeMapHeroProps) {
  const [shouldLoadMap, setShouldLoadMap] = useState(false)

  useEffect(() => {
    if (shouldLoadMap) return

    let cancelIdle: () => void = () => undefined
    const frameId = window.requestAnimationFrame(() => {
      cancelIdle = runWhenIdle(() => setShouldLoadMap(true), 1200)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      cancelIdle()
    }
  }, [shouldLoadMap])

  return (
    <div className={cn('relative w-full overflow-hidden rounded-none md:rounded-[2rem]', className)}>
      {shouldLoadMap ? (
        <MapViewport mode="hero" className="h-full w-full" />
      ) : (
        <HomeMapPreview onActivate={() => setShouldLoadMap(true)} />
      )}
    </div>
  )
}
