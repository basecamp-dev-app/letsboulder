import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicCrag: vi.fn(),
}))

vi.mock('@/lib/media/r2', () => ({ deleteObject: mocks.deleteObject }))
vi.mock('@/features/crags/public-server', () => ({ revalidatePublicCrag: mocks.revalidatePublicCrag }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { deleteSubmission } from '@/features/submissions/server/submissions/delete-submission'

const image = {
  id: 'image-1', created_by: 'user-1', submission_id: null, crag_id: 'crag-1', storage_provider: 'supabase',
  storage_bucket: 'uploads', storage_path: 'user-1/image.jpg', original_bucket: null, original_key: null,
}

function readClient(ownerId = 'user-1') {
  const maybeSingleImage = vi.fn().mockResolvedValue({ data: { ...image, created_by: ownerId }, error: null })
  const maybeSingleCrag = vi.fn().mockResolvedValue({ data: { slug: 'test-crag', country_code: 'GB' }, error: null })
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => table === 'images' ? { maybeSingle: maybeSingleImage } : { maybeSingle: maybeSingleCrag }),
    })),
  }))
  return { client: { from }, from }
}

describe('deleteSubmission client boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps reads on the authenticated client and privileged operations on the admin client', async () => {
    const { client, from } = readClient()
    const remove = vi.fn().mockResolvedValue({ error: null })
    const admin = {
      from: () => { throw new Error('service-role table read forbidden') },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      storage: { from: vi.fn(() => ({ remove })) },
    }

    const response = await deleteSubmission({ supabase: client as never, supabaseAdmin: admin as never, userId: 'user-1', imageId: 'image-1' })

    expect(response.status).toBe(200)
    expect(from).toHaveBeenCalledWith('images')
    expect(from).toHaveBeenCalledWith('crags')
    expect(admin.rpc).toHaveBeenCalledWith('soft_delete_published_submission', {
      p_image_ids: ['image-1'], p_owner_id: 'user-1',
    })
    expect(remove).toHaveBeenCalledWith(['user-1/image.jpg'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/gb/test-crag')
  })

  it('rejects a non-owner before constructing any privileged operation', async () => {
    const { client } = readClient('other-user')
    const admin = { rpc: vi.fn(), storage: { from: vi.fn() } }

    const response = await deleteSubmission({ supabase: client as never, supabaseAdmin: admin as never, userId: 'user-1', imageId: 'image-1' })

    expect(response.status).toBe(403)
    expect(admin.rpc).not.toHaveBeenCalled()
    expect(admin.storage.from).not.toHaveBeenCalled()
  })
})
