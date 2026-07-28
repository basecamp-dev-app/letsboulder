import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCragCacheTag,
  getCragSlugCacheTag,
  revalidatePublicCrag,
  revalidatePublicCragSlug,
} from '@/features/crags/server/crag-cache-tags'

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock('next/cache', () => ({ revalidateTag }))

describe('public crag cache tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes country codes in canonical slug tags', () => {
    expect(getCragCacheTag('crag-1')).toBe('crag:crag-1')
    expect(getCragSlugCacheTag('gb', 'test-crag')).toBe('crag-slug:GB:test-crag')
  })

  it('immediately expires crag data and slug entries', () => {
    revalidatePublicCrag('crag-1')
    revalidatePublicCragSlug('gb', 'test-crag')

    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'crag:crag-1', { expire: 0 })
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'crag-slug:GB:test-crag', { expire: 0 })
  })
})
