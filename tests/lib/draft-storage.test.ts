import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteObject } = vi.hoisted(() => ({
  deleteObject: vi.fn(async () => undefined),
}))

vi.mock('@/lib/media/r2', () => ({ deleteObject }))

import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'

describe('draft storage cleanup', () => {
  beforeEach(() => {
    deleteObject.mockClear()
  })

  it('deletes only R2 keys bound to an authoritative image ID', async () => {
    const storageClient = { storage: { from: vi.fn() } }

    await cleanupDraftStorageObjects(storageClient as never, [
      {
        image_id: '10000000-0000-4000-8000-000000000001',
        storage_provider: 'r2',
        storage_bucket: 'private-media',
        storage_path: 'images/assets/10000000-0000-4000-8000-000000000001/hash/original.jpg',
      },
      {
        image_id: null,
        storage_provider: 'r2',
        storage_bucket: 'private-media',
        storage_path: 'images/assets/20000000-0000-4000-8000-000000000002/hash/original.jpg',
      },
    ])

    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith(
      'private-media',
      'images/assets/10000000-0000-4000-8000-000000000001/hash/original.jpg',
    )
  })
})
