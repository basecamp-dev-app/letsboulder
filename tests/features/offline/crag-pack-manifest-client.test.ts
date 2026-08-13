import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUnauthenticatedClient } = vi.hoisted(() => ({
  getUnauthenticatedClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ getUnauthenticatedClient }))
vi.mock('@/lib/env.server', () => ({
  serverEnv: { NEXT_PUBLIC_MEDIA_CDN_URL: 'https://static.example' },
}))

import { loadCragPackManifest } from '@/features/offline/server/crag-pack-manifest'

describe('crag pack manifest client boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the public manifest through the anonymous RLS client', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const isSuperseded = vi.fn(() => ({ maybeSingle }))
    const isDeleted = vi.fn(() => ({ is: isSuperseded }))
    const eq = vi.fn(() => ({ is: isDeleted }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getUnauthenticatedClient.mockReturnValue({ from })

    await expect(loadCragPackManifest('00000000-0000-4000-8000-000000000001')).resolves.toBeNull()

    expect(getUnauthenticatedClient).toHaveBeenCalledOnce()
    expect(from).toHaveBeenCalledWith('crags')
  })
})
