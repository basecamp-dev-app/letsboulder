'use client'

import { useSyncExternalStore } from 'react'

import { offlinePackStore } from '@/features/offline/lib/offline-pack-store'

const install = offlinePackStore.install.bind(offlinePackStore)
const update = offlinePackStore.update.bind(offlinePackStore)
const repair = offlinePackStore.repair.bind(offlinePackStore)
const remove = offlinePackStore.remove.bind(offlinePackStore)
const discardFailed = offlinePackStore.discardFailed.bind(offlinePackStore)
const resume = offlinePackStore.resume.bind(offlinePackStore)
const refresh = offlinePackStore.refresh.bind(offlinePackStore)

export function useOfflinePacks() {
  const snapshot = useSyncExternalStore(
    offlinePackStore.subscribe,
    offlinePackStore.getSnapshot,
    offlinePackStore.getServerSnapshot,
  )

  return {
    ...snapshot,
    install,
    update,
    repair,
    remove,
    discardFailed,
    resume,
    refresh,
  }
}
