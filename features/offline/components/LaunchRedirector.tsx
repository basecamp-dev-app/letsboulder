'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { resolveLaunchTarget } from '@/lib/navigation/launch-state'

export default function LaunchRedirector() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const target = resolveLaunchTarget({
      pathname: pathname || '/launch',
      search: searchParams.toString() ? `?${searchParams.toString()}` : '',
      isOnline: window.navigator.onLine !== false,
    })
    router.replace(target)
  }, [pathname, router, searchParams])

  return (
    <div className="fixed inset-0 overflow-hidden">
      <MapLoadingShell />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[960] p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-black/40 px-4 py-3 text-white shadow-2xl backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Launch</p>
          <p className="mt-1 text-sm text-white/85">Restoring the most relevant route for this device.</p>
        </div>
      </div>
    </div>
  )
}
