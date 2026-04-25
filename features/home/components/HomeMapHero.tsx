'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
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
      <h1 className="sr-only">Find rock, gyms, and topos near you.</h1>
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
        <MapViewport mode="hero" className="h-full w-full" showUserLocation={true} />
      ) : (
        <HomeMapPreview onActivate={() => setShouldLoadMap(true)} />
      )}
    </div>
  )
}
