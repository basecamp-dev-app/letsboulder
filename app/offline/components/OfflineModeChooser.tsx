'use client'

import { useEffect, useState } from 'react'

export default function OfflineModeChooser() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const sync = () => setIsOnline(window.navigator.onLine !== false)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Choose your mode</h1>
              <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-300">
                Open saved crag and climb packs from this device, or jump back into the live map when you have a connection.
              </p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => window.location.assign('/offline/library')}
              className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:border-amber-800"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Saved packs</p>
              <h2 className="mt-3 text-xl font-semibold text-gray-950 dark:text-white">Open offline library</h2>
              <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
                Browse saved crag maps, tiles, topo images, and route lines stored on this device.
              </p>
            </button>

            {isOnline ? (
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:hover:border-emerald-800"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Live app</p>
                <h2 className="mt-3 text-xl font-semibold text-gray-950 dark:text-white">Open live map</h2>
                <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-100/80">
                  Return to the online map, search, and the rest of the live app experience.
                </p>
              </button>
            ) : (
              <div className="rounded-3xl border border-gray-200 bg-gray-50/80 p-5 text-left dark:border-gray-800 dark:bg-gray-900/70">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Live app</p>
                <h2 className="mt-3 text-xl font-semibold text-gray-950 dark:text-white">Open live map</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  The live map needs a connection. Reconnect, then come back here to switch modes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
