import { describe, expect, test, vi } from 'vitest'

import { appendDraftImages } from '@/features/submissions/server/drafts/draft-images'

describe('appendDraftImages', () => {
  test('preserves uploaded_image_id through schema parsing and into the atomic append', async () => {
    const uploadedImageId = '11111111-1111-4111-8111-111111111111'
    const rpc = vi.fn(async () => ({ data: { updated_at: '2026-08-02T00:00:01.000Z' }, error: null }))
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === 'images') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [{
                  id: uploadedImageId,
                  created_by: 'user-1',
                  original_bucket: 'private-media',
                  original_key: 'images/assets/image/original.jpg',
                  storage_bucket: null,
                  storage_path: null,
                }],
                error: null,
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
          })),
        }
      }),
    }

    const response = await appendDraftImages({
      supabase: supabase as never,
      userId: 'user-1',
      draftId: 'draft-1',
      requestBody: {
        images: [{
          uploaded_image_id: uploadedImageId,
          storage_bucket: 'caller-bucket',
          storage_path: 'caller-path',
        }],
        expected_updated_at: '2026-08-02T00:00:00.000Z',
      },
    })

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('append_submission_draft_images_atomic', expect.objectContaining({
      p_images: [expect.objectContaining({
        uploaded_image_id: uploadedImageId,
        linked_image_id: uploadedImageId,
      })],
    }))
  })
})
