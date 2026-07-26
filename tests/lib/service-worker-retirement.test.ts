// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRegisteredServiceWorkers, isRetiredOfflineCacheName } from '@/lib/offline/service-worker-client'

describe('service worker retirement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('recognizes only letsboulder offline caches', () => {
    expect(isRetiredOfflineCacheName('offline-shell-v4')).toBe(true)
    expect(isRetiredOfflineCacheName('offline-build-assets-old')).toBe(true)
    expect(isRetiredOfflineCacheName('runtime-transient-v2')).toBe(true)
    expect(isRetiredOfflineCacheName('unrelated-cache')).toBe(false)
  })

  it('unregisters only /sw.js and preserves unrelated caches', async () => {
    const unregisterRetired = vi.fn(async () => true)
    const unregisterOther = vi.fn(async () => true)
    const registrations = [
      { active: { scriptURL: 'https://letsboulder.com/sw.js' }, waiting: null, installing: null, unregister: unregisterRetired },
      { active: { scriptURL: 'https://letsboulder.com/other-worker.js' }, waiting: null, installing: null, unregister: unregisterOther },
    ] as unknown as ServiceWorkerRegistration[]
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(async () => registrations) },
    })
    const cacheStorage = {
      keys: vi.fn(async () => ['offline-media-v2', 'runtime-transient-v2', 'unrelated-cache']),
      delete: vi.fn(async () => true),
    }
    Object.defineProperty(window, 'caches', { configurable: true, value: cacheStorage })
    vi.stubGlobal('caches', cacheStorage)

    await clearRegisteredServiceWorkers()

    expect(unregisterRetired).toHaveBeenCalledTimes(1)
    expect(unregisterOther).not.toHaveBeenCalled()
    expect(cacheStorage.delete).toHaveBeenCalledWith('offline-media-v2')
    expect(cacheStorage.delete).toHaveBeenCalledWith('runtime-transient-v2')
    expect(cacheStorage.delete).not.toHaveBeenCalledWith('unrelated-cache')
  })
})
