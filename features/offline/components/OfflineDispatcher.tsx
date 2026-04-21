'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { resolveConnectivityState } from '@/lib/offline/connectivity'

export default function OfflineDispatcher() {
  const router = useRouter()

  useEffect(() => {
    const connectivity = resolveConnectivityState({
      isOnline: window.navigator.onLine !== false,
    })

    if (connectivity.mode === 'healthy') {
      router.replace('/')
      return
    }

    router.replace(`/offline/library?reason=${connectivity.mode === 'offline' ? 'offline' : 'weak-signal'}`)
  }, [router])

  return (
    <div className="fixed inset-0 overflow-hidden">
      <MapLoadingShell />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[960] p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-black/40 px-4 py-3 text-white shadow-2xl backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Offline route</p>
          <p className="mt-1 text-sm text-white/85">Checking the fastest path to either the live map or content available on this device.</p>
        </div>
      </div>
    </div>
  )
}
