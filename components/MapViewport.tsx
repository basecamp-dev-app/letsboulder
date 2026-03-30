'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import WeakSignalSearchSheet from '@/components/map/WeakSignalSearchSheet'
import { Button } from '@/components/ui/button'
import { hasOfflineLaunchPacks } from '@/lib/offline/packs'
import { loadPlacePins } from '@/lib/map/load-place-pins'
import type { PlacePin } from '@/lib/map/place-pins'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapLoadingShell />,
})

type LaunchState = 'loading-shell' | 'slow-connection' | 'redirecting-offline' | 'live-map-ready' | 'no-downloads-fallback'

const SLOW_CONNECTION_MS = 1500
const OFFLINE_REDIRECT_MS = 3000

export default function MapViewport() {
  const router = useRouter()
  const mountedRef = useRef(true)
  const offlinePackAvailabilityRef = useRef<boolean | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [launchState, setLaunchState] = useState<LaunchState>('loading-shell')
  const [placePins, setPlacePins] = useState<PlacePin[] | null>(null)
  const [redirectMessageVisible, setRedirectMessageVisible] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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
    if (!isOnline) {
      router.replace('/offline/library?reason=offline')
      return
    }

    const abortController = new AbortController()
    offlinePackAvailabilityRef.current = null

    void hasOfflineLaunchPacks().then((value) => {
      if (!mountedRef.current) return
      offlinePackAvailabilityRef.current = value
    }).catch(() => {
      if (!mountedRef.current) return
      offlinePackAvailabilityRef.current = false
    })

    void loadPlacePins(abortController.signal).then((pins) => {
      if (!mountedRef.current) return
      setPlacePins(pins)
      setLaunchState('live-map-ready')
    }).catch(() => {
      if (!mountedRef.current) return
      setPlacePins(null)
    })

    const slowTimer = window.setTimeout(() => {
      if (!mountedRef.current) return
      setLaunchState((current) => current === 'loading-shell' ? 'slow-connection' : current)
    }, SLOW_CONNECTION_MS)

    const redirectTimer = window.setTimeout(() => {
      if (!mountedRef.current) return

      if (offlinePackAvailabilityRef.current) {
        setLaunchState('redirecting-offline')
        setRedirectMessageVisible(true)
        window.setTimeout(() => {
          if (!mountedRef.current) return
          router.replace('/offline/library?reason=weak-signal')
        }, 250)
        return
      }

      setLaunchState('no-downloads-fallback')
    }, OFFLINE_REDIRECT_MS)

    return () => {
      abortController.abort()
      window.clearTimeout(slowTimer)
      window.clearTimeout(redirectTimer)
    }
  }, [attempt, isOnline, router])

  const retryLaunch = () => {
    offlinePackAvailabilityRef.current = null
    setLaunchState('loading-shell')
    setPlacePins(null)
    setRedirectMessageVisible(false)
    setAttempt((current) => current + 1)
  }

  const showSlowCta = launchState === 'slow-connection'
  const showNoDownloadsFallback = launchState === 'no-downloads-fallback'

  const overlay = useMemo(() => {
    if (launchState === 'live-map-ready' && placePins) return null

    return (
      <div className="pointer-events-none absolute inset-0 z-[950]">
        <MapLoadingShell />
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 p-4 sm:p-6">
          {showSlowCta ? (
            <div className="mx-auto max-w-xl rounded-3xl border border-amber-400/25 bg-gray-950/88 p-5 text-white shadow-2xl backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-400/15 p-2 text-amber-200">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Connection is slow.</p>
                  <p className="mt-1 text-sm text-white/75">Switch to Offline Downloads if you already saved climbs on this device.</p>
                </div>
                <Button type="button" onClick={() => window.location.assign('/offline/library')} className="bg-emerald-500 text-white hover:bg-emerald-400">
                  Switch to Offline Downloads
                </Button>
              </div>
            </div>
          ) : null}

          {showNoDownloadsFallback ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="rounded-3xl border border-cyan-400/20 bg-gray-950/88 p-5 text-white shadow-2xl backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">The live map is taking longer than expected.</p>
                    <p className="mt-1 text-sm text-white/75">No offline downloads were found on this device, so we are keeping you on the live path.</p>
                  </div>
                  <Button type="button" onClick={retryLaunch} className="bg-white text-gray-950 hover:bg-white/90">
                    <RefreshCw className="mr-2 size-4" />
                    Retry live map
                  </Button>
                </div>
              </div>
              <WeakSignalSearchSheet />
            </div>
          ) : null}

          {launchState === 'redirecting-offline' && redirectMessageVisible ? (
            <div className="mx-auto max-w-xl rounded-3xl border border-emerald-400/25 bg-gray-950/88 p-5 text-white shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3 text-sm font-medium">
                <Loader2 className="size-4 animate-spin" />
                Optimizing for offline use due to weak signal.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }, [launchState, placePins, redirectMessageVisible, showNoDownloadsFallback, showSlowCta])

  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      {launchState === 'live-map-ready' && placePins ? <SatelliteClimbingMap initialPlacePins={placePins} /> : null}
      {overlay}
    </div>
  )
}
