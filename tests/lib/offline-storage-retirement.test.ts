import { beforeEach, describe, expect, it, vi } from 'vitest'
import { del } from 'idb-keyval'
import { clearStoredOfflinePackRecords } from '@/lib/offline/storage'

vi.mock('idb-keyval', () => ({
  del: vi.fn(async () => undefined),
  get: vi.fn(),
  set: vi.fn(),
}))

describe('offline pack storage retirement', () => {
  beforeEach(() => {
    vi.mocked(del).mockClear()
  })

  it('deletes only legacy pack records from IndexedDB', async () => {
    await clearStoredOfflinePackRecords()

    expect(vi.mocked(del).mock.calls.map(([key]) => key)).toEqual([
      'offline-climb-packs',
      'offline-pack-records',
      'offline-climb-manifests',
      'offline-crag-manifests',
    ])
  })
})
