'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { buildRelativeHref, isGenericLaunchPath, isRestorableRoute, writeLastRoute } from '@/lib/navigation/launch-state'

export default function LastRoutePersistence() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname || isGenericLaunchPath(pathname) || !isRestorableRoute(pathname)) {
      return
    }

    const query = searchParams.toString()
    writeLastRoute(buildRelativeHref(pathname, query ? `?${query}` : ''))
  }, [pathname, searchParams])

  return null
}
