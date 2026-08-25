import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActionAuth: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  revalidatePublicCragPaths: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/actions/action-auth', () => ({ getActionAuth: mocks.getActionAuth }))
vi.mock('@/features/crags/public-server', () => ({
  revalidatePublicCragPaths: mocks.revalidatePublicCragPaths,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
    rpc: mocks.rpc,
  })),
}))

import { removeCragImageAction } from '@/features/crag-management/actions/remove-crag-image'

const input = {
  cragId: '11111111-1111-4111-8111-111111111111',
  imageId: '22222222-2222-4222-8222-222222222222',
  reason: 'Duplicate image',
}

describe('removeCragImageAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActionAuth.mockResolvedValue({ success: true, data: { userId: 'admin-1' } })
    mocks.maybeSingle.mockResolvedValue({
      data: { id: input.cragId, country_code: 'GB', slug: 'test-crag' },
      error: null,
    })
    mocks.rpc.mockResolvedValue({ data: { id: input.imageId }, error: null })
  })

  it('rejects unauthenticated callers before touching the database', async () => {
    mocks.getActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })

    await expect(removeCragImageAction(input)).resolves.toEqual({
      success: false,
      error: 'Authentication required',
      status: 401,
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects empty and oversized reasons', async () => {
    const empty = await removeCragImageAction({ ...input, reason: '   ' })
    const oversized = await removeCragImageAction({ ...input, reason: 'x'.repeat(501) })

    expect(empty).toMatchObject({ success: false, status: 400, error: 'Enter a deletion reason' })
    expect(oversized).toMatchObject({ success: false, status: 400, error: 'Deletion reason must be 500 characters or fewer' })
    expect(mocks.getActionAuth).not.toHaveBeenCalled()
  })

  it('calls the crag-bound RPC and revalidates public crag data after success', async () => {
    await expect(removeCragImageAction(input)).resolves.toEqual({
      success: true,
      data: { imageId: input.imageId },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_crag_image', {
      p_crag_id: input.cragId,
      p_image_id: input.imageId,
      p_reason: input.reason,
      p_delete_routes: false,
    })
    expect(mocks.revalidatePublicCragPaths).toHaveBeenCalledWith({
      cragId: input.cragId,
      countryCode: 'GB',
      slug: 'test-crag',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crag/11111111-1111-4111-8111-111111111111')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/image/22222222-2222-4222-8222-222222222222')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/gb/test-crag/i/22222222-2222-4222-8222-222222222222')
  })

  it('returns authorization and mismatch errors without revalidation', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Administrator required' },
    })
    expect(await removeCragImageAction(input)).toEqual({
      success: false,
      error: 'Administrator access required',
      status: 403,
    })

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'Image does not belong to this crag' },
    })
    expect(await removeCragImageAction(input)).toEqual({
      success: false,
      error: 'Image does not belong to this crag',
      status: 400,
    })
    expect(mocks.revalidatePublicCragPaths).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
