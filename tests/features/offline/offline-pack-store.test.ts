import { describe, expect, test, vi } from 'vitest'

import { OfflinePackManager } from '@/features/offline/lib/offline-pack-manager'
import { OfflinePackStore } from '@/features/offline/lib/offline-pack-store'
import type { OfflinePackRecord } from '@/features/offline/lib/offline-pack-types'

describe('offline pack store', () => {
  test('returns one stable server snapshot for React hydration', () => {
    const manager = { list: vi.fn(async () => []) } as unknown as OfflinePackManager
    const store = new OfflinePackStore(manager)

    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot())
  })

  test('publishes the durable failed pack so installation can be retried', async () => {
    const failedPack: OfflinePackRecord = {
      packId: 'crag:fixture', kind: 'crag', entityId: 'fixture', displayName: 'Fixture',
      manifestUrl: '/manifest', activeVersion: null, status: 'error', installedAt: null,
      updatedAt: '2026-09-01T00:00:00.000Z', error: 'Failed to fetch',
    }
    const manager = {
      install: vi.fn(async () => { throw new Error('Failed to fetch') }),
      list: vi.fn(async () => [failedPack]),
    } as unknown as OfflinePackManager
    const store = new OfflinePackStore(manager)

    await expect(store.install('/manifest')).rejects.toThrow('Failed to fetch')

    expect(store.getSnapshot()).toEqual({ loading: false, packs: [failedPack], error: 'Failed to fetch' })
  })
})
