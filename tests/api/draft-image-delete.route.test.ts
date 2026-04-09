import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { createErrorResponse } = vi.hoisted(() => ({
  createErrorResponse: vi.fn((_error: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 })
  ),
}))

const { cleanupDraftStorageObjects } = vi.hoisted(() => ({
  cleanupDraftStorageObjects: vi.fn(async () => undefined),
}))

const { parseWithSchema } = vi.hoisted(() => ({
  parseWithSchema: vi.fn(),
}))

const { withApiMiddleware } = vi.hoisted(() => ({
  withApiMiddleware: vi.fn(),
}))

const { getAdminClientWithAudit } = vi.hoisted(() => ({
  getAdminClientWithAudit: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  createErrorResponse,
}))

vi.mock('@/lib/media/draft-storage', () => ({
  cleanupDraftStorageObjects,
}))

vi.mock('@/lib/api-validation', () => ({
  parseWithSchema,
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware,
}))

vi.mock('@/lib/supabase-server', () => ({
  getAdminClientWithAudit,
}))

import { DELETE } from '@/app/api/submissions/drafts/[id]/images/[imageId]/route'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

const DRAFT_BASE = {
  id: 'draft-1',
  user_id: 'user-1',
  status: 'draft',
  updated_at: '2026-01-01T00:00:00Z',
  last_edited_by: null,
  metadata: { primaryIndex: 0 },
}

const DRAFT_IMAGE_ONE = {
  id: 'image-1',
  draft_id: 'draft-1',
  display_order: 0,
  storage_provider: 'supabase',
  storage_bucket: 'private-bucket',
  storage_path: 'drafts/draft-1/image-1.jpg',
}

const DRAFT_IMAGE_TWO = {
  id: 'image-2',
  draft_id: 'draft-1',
  display_order: 1,
  storage_provider: 'supabase',
  storage_bucket: 'private-bucket',
  storage_path: 'drafts/draft-1/image-2.jpg',
}

function makeRequest(url: string) {
  return new NextRequest(url, { method: 'DELETE' })
}

function makeParams(id: string, imageId: string) {
  return { params: Promise.resolve({ id, imageId }) }
}

function makeAuthenticatedMiddleware(supabase: unknown, userId: string) {
  return {
    ok: true,
    supabase,
    userId,
  } as MiddlewareResult
}

function makeSupabaseForDelete(options: {
  draft?: typeof DRAFT_BASE
  images?: Array<typeof DRAFT_IMAGE_ONE>
}) {
  const draft = options.draft ?? DRAFT_BASE
  const images = options.images ?? [DRAFT_IMAGE_ONE, DRAFT_IMAGE_TWO]

  const deleteEqDraftId = vi.fn(async () => ({ error: null }))
  const deleteEqImageId = vi.fn(() => ({ eq: deleteEqDraftId }))
  const updateSelect = vi.fn(async () => ({ data: { updated_at: '2026-01-01T00:01:00Z', metadata: {} }, error: null }))
  const updateEqStatus = vi.fn(() => ({ select: updateSelect }))
  const updateEqId = vi.fn(() => ({ eq: updateEqStatus }))

  return {
    from: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: draft, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: updateEqId,
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: images, error: null })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: deleteEqImageId,
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_collaborators') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        }
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      }
    }),
  }
}

describe('/api/submissions/drafts/[id]/images/[imageId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getAdminClientWithAudit).mockReturnValue({} as never)
  })

  test('returns 404 when the target image is not present even if only one image row is returned', async () => {
    const supabase = makeSupabaseForDelete({ images: [DRAFT_IMAGE_ONE] })
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    vi.mocked(parseWithSchema)
      .mockReturnValueOnce({ success: true, data: { id: 'draft-1', imageId: 'image-2' } })
      .mockReturnValueOnce({ success: true, data: { expected_updated_at: '2026-01-01T00:00:00Z' } })

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-2?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-2')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Draft image not found' })
  })

  test('returns 400 when deleting the only remaining image', async () => {
    const supabase = makeSupabaseForDelete({ images: [{ ...DRAFT_IMAGE_ONE, id: 'image-1' }] })
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    vi.mocked(parseWithSchema)
      .mockReturnValueOnce({ success: true, data: { id: 'draft-1', imageId: 'image-1' } })
      .mockReturnValueOnce({ success: true, data: { expected_updated_at: '2026-01-01T00:00:00Z' } })

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-1?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-1')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'A draft must keep at least one face image' })
  })
})
