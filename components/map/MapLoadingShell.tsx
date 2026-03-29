'use client'

import Image from 'next/image'

export default function MapLoadingShell() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-white">
      <Image
        src="/splash.png"
        alt="Letsboulder climbing map preview"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-40"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.16),transparent_22%),radial-gradient(circle_at_74%_34%,rgba(34,197,94,0.12),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.22),rgba(2,6,23,0.82))]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.12)_48%,rgba(2,6,23,0.58)_100%)]" />
      <div className="relative flex h-full items-end px-6 pb-16 pt-24 sm:px-10 sm:pb-20">
        <div className="max-w-md rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Letsboulder map</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Explore crags after first paint, not before.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-200/85 sm:text-base">Start with a lighter first view, then open the full climbing map when you are ready to pan, zoom, and browse pins.</p>
          <div className="mt-5 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90">
            Explore map
          </div>
        </div>
      </div>
    </div>
  )
}
