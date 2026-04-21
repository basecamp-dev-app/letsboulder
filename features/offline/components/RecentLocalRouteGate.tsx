'use client'

import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { readMostRecentLocalEntry } from '@/lib/offline/recent-local'

interface RecentLocalRouteGateProps {
  href: string
  localView: ReactNode
  children: ReactNode
}

export default function RecentLocalRouteGate({ href, localView, children }: RecentLocalRouteGateProps) {
  const showLocalView = useSyncExternalStore(
    () => () => {},
    () => readMostRecentLocalEntry()?.href === href,
    () => false,
  )

  return showLocalView ? localView : children
}
