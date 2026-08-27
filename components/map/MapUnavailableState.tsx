'use client'

import Link from 'next/link'
import { MapPinned, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MapFailureKind } from '@/lib/map/map-failure'
import { cn } from '@/lib/utils'

interface MapUnavailableStateProps {
  errorId: string
  failureKind: MapFailureKind
  title?: string
  description: string
  recoveryHref: string
  recoveryLabel: string
  onRetry?: () => void
  className?: string
}

export default function MapUnavailableState({
  errorId,
  failureKind,
  title = 'Interactive map unavailable',
  description,
  recoveryHref,
  recoveryLabel,
  onRetry,
  className,
}: MapUnavailableStateProps) {
  const retryable = failureKind !== 'webgl-unavailable' && Boolean(onRetry)

  return (
    <section
      aria-labelledby={`map-unavailable-${errorId}`}
      aria-live="polite"
      aria-atomic="true"
      className={cn('flex h-full min-h-56 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.15),_transparent_44%),linear-gradient(145deg,_#0f172a,_#1e293b)] p-5 text-white', className)}
      data-testid="map-unavailable-state"
    >
      <div className="w-full max-w-lg rounded-[28px] border border-white/15 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-md sm:p-6">
        <MapPinned className="size-8 text-amber-300" aria-hidden="true" />
        <h2 id={`map-unavailable-${errorId}`} className="mt-4 text-2xl font-black tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-200">{description}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild className="rounded-full bg-amber-300 text-slate-950 hover:bg-amber-200">
            <Link href={recoveryHref}>{recoveryLabel}</Link>
          </Button>
          {retryable ? (
            <Button type="button" variant="outline" onClick={onRetry} className="rounded-full border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <RotateCw aria-hidden="true" /> Retry map
            </Button>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-slate-400">Diagnostic ID: <code>{errorId}</code></p>
      </div>
    </section>
  )
}
