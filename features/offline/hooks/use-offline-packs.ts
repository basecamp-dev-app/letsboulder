'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { offlinePackStore } from '@/features/offline/lib/offline-pack-store'

let initialized = false

export function useOfflinePacks() {
  const snapshot = useSyncExternalStore(
    offlinePackStore.subscribe,
    offlinePackStore.getSnapshot,
    offlinePackStore.getServerSnapshot,
  )

  useEffect(() => {
    if (initialized) return
    initialized = true
    void offlinePackStore.resume().catch(() => undefined)
  }, [])

  return {
    ...snapshot,
    install: offlinePackStore.install.bind(offlinePackStore),
    update: offlinePackStore.update.bind(offlinePackStore),
    remove: offlinePackStore.remove.bind(offlinePackStore),
    discardFailed: offlinePackStore.discardFailed.bind(offlinePackStore),
    resume: offlinePackStore.resume.bind(offlinePackStore),
    refresh: offlinePackStore.refresh.bind(offlinePackStore),
  }
}
