import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { appendDraftImages } = vi.hoisted(() => ({
  appendDraftImages: vi.fn(async () =>
    Response.json({ success: true }, { status: 200 })
  ),
}))

const { withApiMiddleware } = vi.hoisted(() => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/features/submissions/server/drafts/draft-images', () => ({
  appendDraftImages,
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware,
}))

import { POST } from '@/app/api/submissions/drafts/[id]/images/route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/submissions/drafts/draft-1/images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/submissions/drafts/[id]/images', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {} as never,
      userId: 'user-1',
    })
    vi.mocked(appendDraftImages).mockResolvedValue(Response.json({ success: true }))
  })

  test('preserves uploaded_image_id for upload-session attachments', async () => {
    const uploadedImageId = '11111111-1111-4111-8111-111111111111'

    const response = await POST(makeRequest({
      images: [{
        uploaded_image_id: uploadedImageId,
        storage_bucket: 'staging',
        storage_path: 'uploads/session-image.jpg',
      }],
      expected_updated_at: '2026-08-02T00:00:00.000Z',
    }), { params: Promise.resolve({ id: 'draft-1' }) })

    expect(response.status).toBe(200)
    expect(appendDraftImages).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        images: [expect.objectContaining({ uploaded_image_id: uploadedImageId })],
      }),
    }))
  })
})
