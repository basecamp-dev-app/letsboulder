import { describe, expect, test, vi } from 'vitest'

import { executeNewImageSubmission } from '@/features/submissions/server/submissions/submit-new-image'

const imageId = '11111111-1111-4111-8111-111111111111'
const inputImage = {
  uploadedImageId: imageId,
  uploadedBucket: 'caller-bucket',
  uploadedPath: 'caller-path',
  width: 10,
  height: 10,
  naturalWidth: 10,
  naturalHeight: 10,
  captureDate: null,
  gpsData: null,
}

function executeWithImage(image: Record<string, unknown>, rpc = vi.fn()) {
  const supabase = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === 'images') {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [image], error: null })) })) }
      }
      return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) }
    }),
  }

  return executeNewImageSubmission({
    supabase: supabase as never,
    supabaseAdmin: null,
    createErrorResponse: vi.fn() as never,
    userId: 'user-1',
    body: { cragId: 'crag-1', primaryIndex: 0 },
    validatedNewImages: [inputImage],
    primaryNewImage: inputImage,
    normalizedFaceDirectionsByImage: { 0: ['N'] },
    routePayload: [{
      name: 'Route',
      slug: 'route',
      grade: '6A',
      description: null,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      sequence_order: 0,
      image_width: 10,
      image_height: 10,
    }],
    normalizedRouteType: 'boulder',
    preparedRoutes: [],
  })
}

describe('new image submissions', () => {
  test('rejects locator bypass when the authoritative image belongs to another user', async () => {
    const rpc = vi.fn()
    const result = await executeWithImage({
      id: imageId,
      created_by: 'user-2',
      upload_purpose: 'submission_image',
    }, rpc)

    expect(result.error?.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('writes authoritative canonical metadata instead of caller locators', async () => {
    const rpc = vi.fn(async () => ({
      data: { image_id: imageId, climb_ids: [], route_line_ids: [], climbs_created: 1 },
      error: null,
    }))
    const result = await executeWithImage({
      id: imageId,
      created_by: 'user-1',
      upload_purpose: 'submission_image',
      optimized_bucket: 'public-media',
      optimized_key: `images/assets/${imageId}/hash/canonical.webp`,
      optimized_mime: 'image/webp',
      optimized_bytes: 1000,
      optimized_width: 1200,
      optimized_height: 900,
      processing_status: 'ready',
      moderation_status: 'approved',
      visibility: 'public',
      status: 'approved',
    }, rpc)

    expect(result.error).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('create_unified_submission_atomic', expect.objectContaining({
      p_primary_image: expect.objectContaining({
        storage_bucket: 'public-media',
        storage_path: `images/assets/${imageId}/hash/canonical.webp`,
        width: 1200,
        height: 900,
      }),
    }))
  })
})
