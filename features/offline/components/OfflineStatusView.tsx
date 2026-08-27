'use client'
/* eslint-disable @next/next/no-html-link-for-pages -- Standalone offline routes require service-worker-controlled document navigations. */

import { RefreshCw, Wifi, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useConnectivity } from '@/features/offline/hooks/use-connectivity'

export default function OfflineStatusView() {
  const { status, check } = useConnectivity()
  const online = status === 'online'
  const checking = status === 'checking'

  return (
    <main id="main-content" className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30 sm:p-8">
        {online ? <Wifi aria-hidden="true" className="text-emerald-700 dark:text-emerald-300" /> : <WifiOff aria-hidden="true" className="text-cyan-700 dark:text-cyan-300" />}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
          {checking ? 'Checking connection' : online ? 'Connection restored' : 'Connection unavailable'}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">
          {checking ? 'Checking whether you’re online…' : online ? 'You’re back online' : 'You’re offline'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {online
            ? 'Live maps and the full guide are available again. Saved guides remain on this device.'
            : 'Live maps and updates need a connection, but guides saved on this device remain available.'}
        </p>

        <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">Available on this device</p>
          <p className="mt-2">Open your offline library for saved route details, topo images, and coordinates.</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {online ? <Button asChild className="rounded-xl"><a href="/">Return to online app</a></Button> : null}
          <Button asChild variant={online ? 'outline' : 'default'} className="rounded-xl"><a href="/offline/library">Open offline library</a></Button>
          {!online ? (
            <Button type="button" variant="outline" className="rounded-xl" disabled={checking} onClick={() => void check()}>
              <RefreshCw aria-hidden="true" /> {checking ? 'Checking…' : 'Check connection'}
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  )
}
