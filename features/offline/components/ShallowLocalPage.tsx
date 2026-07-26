'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface ShallowLocalPageProps {
  title: string
  kind: 'crag' | 'climb'
  href: string
  subtitle?: string
  message?: string
}

export default function ShallowLocalPage({ title, kind, href, subtitle, message }: ShallowLocalPageProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">Available locally</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{subtitle}</p> : null}

          <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Shallow local view</p>
            <p className="mt-2">{message || 'This page is opening from content already stored on this device. Some live sections may be unavailable until connectivity improves.'}</p>
          </div>

          {kind === 'crag' ? (
            <section className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Locally available climbs</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No locally available climbs from this crag.</p>
            </section>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-xl">
              <Link href={href}>Retry this route</Link>
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
