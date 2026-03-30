'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { runWhenIdle } from '@/lib/run-when-idle'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapLoadingShell />,
})

export default function MapViewport() {
  const [shouldLoadMap, setShouldLoadMap] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const sync = () => setIsOnline(window.navigator.onLine !== false)
    sync()

    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  useEffect(() => {
    if (shouldLoadMap || !isOnline) return

    let frameId = 0
    let timeoutId = 0
    let cancelIdle: (() => void) | undefined

    frameId = window.requestAnimationFrame(() => {
      cancelIdle = runWhenIdle(() => {
        setShouldLoadMap(true)
      }, 1200)
    })

    timeoutId = window.setTimeout(() => {
      setShouldLoadMap(true)
    }, 2500)

    return () => {
      window.cancelAnimationFrame(frameId)
      cancelIdle?.()
      window.clearTimeout(timeoutId)
    }
  }, [isOnline, shouldLoadMap])

  const activateMap = () => {
    if (!isOnline) return
    setShouldLoadMap(true)
  }

  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      {!isOnline ? (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
          <div className="w-full max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Open saved downloads</h1>
                <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-300">
                  The live map stays unloaded while you are offline. Open saved crags and climbs from this device, then come back online for the full map.
                </p>
              </div>
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                Offline
              </span>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Link
                href="/offline/library"
                className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:border-amber-800"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Saved packs</p>
                <h2 className="mt-3 text-xl font-semibold text-gray-950 dark:text-white">Open offline library</h2>
                <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
                  Browse saved crag maps, tiles, topo images, and route lines stored on this device.
                </p>
              </Link>

              <div className="rounded-3xl border border-gray-200 bg-gray-50/80 p-5 text-left dark:border-gray-800 dark:bg-gray-900/70">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Live app</p>
                <h2 className="mt-3 text-xl font-semibold text-gray-950 dark:text-white">Live map paused</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Reconnect to load satellite tiles, live crag pins, and map clustering.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : shouldLoadMap ? (
        <SatelliteClimbingMap />
      ) : (
        <button
          type="button"
          onClick={activateMap}
          onPointerDown={activateMap}
          onTouchStart={activateMap}
          onFocus={activateMap}
          className="block h-full w-full text-left"
          aria-label="Load interactive climbing map"
        >
          <MapLoadingShell />
        </button>
      )}
    </div>
  )
}
