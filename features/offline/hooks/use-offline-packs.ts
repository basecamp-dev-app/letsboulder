'use client'

import { offlinePackStore } from '@/features/offline/lib/offline-pack-store'
import { useSyncExternalStore } from 'react'

export function useOfflinePacks() {
  const snapshot = useSyncExternalStore(
    offlinePackStore.subscribe,
    offlinePackStore.getSnapshot,
    offlinePackStore.getServerSnapshot,
  )

  return {
    ...snapshot,
    install: offlinePackStore.install.bind(offlinePackStore),
    update: offlinePackStore.update.bind(offlinePackStore),
    repair: offlinePackStore.repair.bind(offlinePackStore),
    remove: offlinePackStore.remove.bind(offlinePackStore),
    discardFailed: offlinePackStore.discardFailed.bind(offlinePackStore),
    resume: offlinePackStore.resume.bind(offlinePackStore),
    refresh: offlinePackStore.refresh.bind(offlinePackStore),
  }
}
