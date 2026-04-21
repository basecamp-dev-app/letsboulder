'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { buildRelativeHref, isGenericLaunchPath, isRestorableRoute, writeLastRoute } from '@/lib/navigation/launch-state'
import { getRestorableRouteKind } from '@/lib/navigation/launch-state'
import { writeRecentLocalEntry } from '@/lib/offline/recent-local'

function getRecentLocalSubtitle(pathname: string) {
  if (/^\/[a-z]{2}\/[^/]+$/.test(pathname)) {
    return 'Recent shallow local crag view'
  }

  if (/^\/[a-z]{2}\/[^/]+\/i\/[^/]+$/.test(pathname)) {
    return 'Recent shallow local climb view'
  }

  return undefined
}

export default function LastRoutePersistence() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname || isGenericLaunchPath(pathname) || !isRestorableRoute(pathname)) {
      return
    }

    const query = searchParams.toString()
    const href = buildRelativeHref(pathname, query ? `?${query}` : '')
    writeLastRoute(href)

    const title = typeof document !== 'undefined' ? document.title : pathname
    const kind = getRestorableRouteKind(pathname)
    if (!kind || kind === 'logbook') return

    writeRecentLocalEntry({
      href,
      title,
      kind,
      subtitle: getRecentLocalSubtitle(pathname),
    })
  }, [pathname, searchParams])

  return null
}
