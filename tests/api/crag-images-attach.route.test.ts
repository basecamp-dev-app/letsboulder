import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/features/crags/server/crag-cache-tags', () => ({
  revalidatePublicCrag: vi.fn(),
}))

import { POST } from '@/app/api/crags/[id]/images/attach/route'
import { revalidatePublicCrag } from '@/features/crags/server/crag-cache-tags'
import { withApiMiddleware } from '@/lib/csrf-server'

const imageId = '11111111-1111-4111-8111-111111111111'

function request(ids = [imageId, imageId]) {
  return new NextRequest('http://localhost/api/crags/crag-1/images/attach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images: ids.map((id) => ({ uploaded_image_id: id })) }),
  })
}

function makeSupabase(imageOverrides: Record<string, unknown> = {}, existingRows: unknown[] = []) {
  const insert = vi.fn(() => ({
    select: vi.fn(async () => ({
      data: [{ id: 'attachment-1', linked_image_id: imageId }],
      error: null,
    })),
  }))
  const image = {
    id: imageId,
    created_by: 'user-1',
    optimized_bucket: 'public-media',
    optimized_key: `images/assets/${imageId}/hash/canonical.webp`,
    optimized_mime: 'image/webp',
    optimized_bytes: 1000,
    optimized_width: 1200,
    optimized_height: 900,
    variants: { detail: { webp: { path: 'detail.webp' } } },
    url: `/api/media/public-media/images/assets/${imageId}/hash/detail.webp`,
    latitude: 49.2,
    longitude: -2.1,
    processing_status: 'ready',
    moderation_status: 'approved',
    visibility: 'public',
    status: 'approved',
    upload_purpose: 'crag_image',
    upload_crag_id: 'crag-1',
    ...imageOverrides,
  }

  return {
    insert,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'crags') {
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'crag-1' }, error: null })) })) })) }
        }
        if (table === 'images') {
          return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [image], error: null })) })) }
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ or: vi.fn(async () => ({ data: existingRows, error: null })) })) })),
          insert,
        }
      }),
    },
  }
}

describe('Crag image attachment', () => {
  beforeEach(() => vi.resetAllMocks())

  test('uses canonical WebP metadata, deduplicates, and revalidates the crag', async () => {
    const { client, insert } = makeSupabase()
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: true, supabase: client, userId: 'user-1' } as never)

    const response = await POST(request(), { params: Promise.resolve({ id: 'crag-1' }) })

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      crag_id: 'crag-1',
      linked_image_id: imageId,
      url: `/api/media/public-media/images/assets/${imageId}/hash/detail.webp`,
      width: 1200,
      height: 900,
    })])
    expect(revalidatePublicCrag).toHaveBeenCalledWith('crag-1')
  })

  test('is idempotent when the image is already attached', async () => {
    const existing = { id: 'attachment-1', crag_id: 'crag-1', linked_image_id: imageId }
    const { client, insert } = makeSupabase({}, [existing])
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: true, supabase: client, userId: 'user-1' } as never)

    const response = await POST(request([imageId]), { params: Promise.resolve({ id: 'crag-1' }) })

    expect(response.status).toBe(200)
    expect(insert).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ images: [existing] })
  })

  test('rejects an image uploaded for another target', async () => {
    const { client, insert } = makeSupabase({ upload_crag_id: 'crag-2' })
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: true, supabase: client, userId: 'user-1' } as never)

    const response = await POST(request([imageId]), { params: Promise.resolve({ id: 'crag-1' }) })

    expect(response.status).toBe(403)
    expect(insert).not.toHaveBeenCalled()
  })
})
