'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { readShallowLocalClimbSnapshot, type CachedClimbSnapshot } from '@/features/offline/lib/shallow-local-climb-cache'

interface ShallowLocalClimbPageProps {
  imageId: string
  climbId?: string | null
  href: string
  subtitle?: string
}

export default function ShallowLocalClimbPage({ imageId, climbId, href, subtitle }: ShallowLocalClimbPageProps) {
  const [snapshot, setSnapshot] = useState<CachedClimbSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await readShallowLocalClimbSnapshot(imageId, climbId).catch(() => null)
      if (!cancelled) {
        setSnapshot(result)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [climbId, imageId])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">Available locally</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">{snapshot?.title || 'Locally available climb'}</h1>
          {subtitle ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{subtitle}</p> : null}

          <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Shallow local view</p>
            <p className="mt-2">This climb is opening from content already stored on this device. Live notes, extended beta, and other network-backed sections may be unavailable.</p>
          </div>

          {snapshot?.imageUrl ? (
            <div className="mt-8 relative aspect-[16/10] overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
              <Image src={snapshot.imageUrl} alt={snapshot.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 1024px" unoptimized />
            </div>
          ) : null}

          {snapshot?.grade ? (
            <p className="mt-4 text-sm font-medium text-gray-600 dark:text-gray-300">Grade: {formatGradeForDisplay(snapshot.grade, 'font_scale')}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-xl">
              <Link href={href}>Retry this climb</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/offline/library">Open available locally</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/">Open live map</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
