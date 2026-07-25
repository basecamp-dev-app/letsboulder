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

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit,
}))

import { DELETE } from '@/app/api/submissions/drafts/[id]/images/[imageId]/route'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

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

function makeSupabaseForDelete(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) }
}

function mockValidRequest(expectedUpdatedAt = '2026-01-01T00:00:00Z') {
  vi.mocked(parseWithSchema)
    .mockReturnValueOnce({ success: true, data: { id: 'draft-1', imageId: 'image-2' } })
    .mockReturnValueOnce({ success: true, data: { expected_updated_at: expectedUpdatedAt } })
}

describe('/api/submissions/drafts/[id]/images/[imageId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getAdminClientWithAudit).mockReturnValue({} as never)
  })

  test('maps an RPC not_found error to 404', async () => {
    const supabase = makeSupabaseForDelete({
      data: null,
      error: { message: 'Draft image not found', details: 'not_found' },
    })
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    mockValidRequest()

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-2?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-2')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Draft image not found' })
    expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_image_atomic', {
      p_draft_id: 'draft-1',
      p_draft_image_id: 'image-2',
      p_expected_updated_at: '2026-01-01T00:00:00Z',
    })
  })

  test('maps the minimum-image database conflict to 400', async () => {
    const supabase = makeSupabaseForDelete({
      data: null,
      error: {
        message: 'A draft must retain at least one image',
        details: 'draft_conflict',
      },
    })
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    mockValidRequest()

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-2?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-2')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'A draft must keep at least one face image' })
    expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_image_atomic', {
      p_draft_id: 'draft-1',
      p_draft_image_id: 'image-2',
      p_expected_updated_at: '2026-01-01T00:00:00Z',
    })
  })

  test('uses the RPC hint timestamp in a stale conflict payload', async () => {
    const supabase = makeSupabaseForDelete({
      data: null,
      error: {
        message: 'Draft changed while deleting image',
        details: 'draft_conflict',
        hint: '2026-01-02 12:34:56+00',
      },
    })
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    mockValidRequest()

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-2?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-2')
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: 'draft_conflict',
      current_updated_at: '2026-01-02 12:34:56+00',
      current_data: expect.objectContaining({ updated_at: '2026-01-02 12:34:56+00' }),
    }))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_image_atomic', {
      p_draft_id: 'draft-1',
      p_draft_image_id: 'image-2',
      p_expected_updated_at: '2026-01-01T00:00:00Z',
    })
  })

  test('returns updated metadata and cleans storage after a successful RPC', async () => {
    const cleanup = [{
      storage_provider: 'r2',
      storage_bucket: 'private-bucket',
      storage_path: 'drafts/draft-1/image-2.jpg',
    }]
    const supabase = makeSupabaseForDelete({
      data: {
        success: true,
        draft: {
          updated_at: '2026-01-01T00:01:00Z',
          metadata: { primaryIndex: 0 },
        },
        cleanup,
      },
      error: null,
    })
    const admin = { storage: true }
    vi.mocked(getAdminClientWithAudit).mockReturnValue(admin as never)
    vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
    mockValidRequest()

    const response = await DELETE(
      makeRequest('http://localhost:3000/api/submissions/drafts/draft-1/images/image-2?expected_updated_at=2026-01-01T00:00:00Z'),
      makeParams('draft-1', 'image-2')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      draft: {
        updated_at: '2026-01-01T00:01:00Z',
        metadata: { primaryIndex: 0 },
      },
      deleted_image_id: 'image-2',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_image_atomic', {
      p_draft_id: 'draft-1',
      p_draft_image_id: 'image-2',
      p_expected_updated_at: '2026-01-01T00:00:00Z',
    })
    expect(cleanupDraftStorageObjects).toHaveBeenCalledWith(admin, cleanup)
    expect(supabase.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      cleanupDraftStorageObjects.mock.invocationCallOrder[0]
    )
  })
})
