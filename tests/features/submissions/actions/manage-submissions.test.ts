import { describe, expect, test, vi, beforeEach } from 'vitest'
import {
  createSubmissionDraftAction,
  deleteSubmissionDraftAction,
  publishSubmissionDraftAction,
  deletePublishedSubmissionAction,
} from '@/features/submissions/actions/manage-submissions'

vi.mock('@/lib/supabase-server', async () => {
  const createMaybeSingle = () => vi.fn().mockResolvedValue({ data: null, error: null })

  return {
    getServerClient: vi.fn().mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: { success: true, cleanup: [] }, error: null }),
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            maybeSingle: createMaybeSingle(),
            single: createMaybeSingle(),
          })),
          contains: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => ({
                maybeSingle: createMaybeSingle(),
              })),
            })),
          })),
          order: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => ({
              maybeSingle: createMaybeSingle(),
            })),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: createMaybeSingle(),
            order: vi.fn().mockImplementation(() => ({
              select: vi.fn().mockImplementation(() => ({
                order: vi.fn(),
              })),
            })),
          })),
        })),
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockImplementation(() => ({
              maybeSingle: createMaybeSingle(),
            })),
          })),
        })),
      })),
    }),
    getAdminClient: vi.fn().mockResolvedValue({
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            maybeSingle: createMaybeSingle(),
            single: createMaybeSingle(),
          })),
          contains: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => ({
                maybeSingle: createMaybeSingle(),
              })),
            })),
          })),
          order: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => ({
              maybeSingle: createMaybeSingle(),
            })),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: createMaybeSingle(),
          })),
        })),
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockImplementation(() => ({
              maybeSingle: createMaybeSingle(),
            })),
          })),
        })),
      })),
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      },
    }),
    getAdminClientWithAudit: vi.fn().mockResolvedValue({
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            maybeSingle: createMaybeSingle(),
            single: createMaybeSingle(),
          })),
        })),
      })),
    }),
  }
})

vi.mock('@/features/submissions/server/drafts/draft-promote', () => ({
  promoteDraftToSubmission: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ published: { imageId: 'test-img-id' } }), { status: 200 })
  ),
}))

vi.mock('@/features/submissions/server/submissions/delete-submission', () => ({
  deleteSubmission: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 })
  ),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/actions/action-auth', () => ({
  getActionAuth: vi.fn(),
}))

vi.mock('@/lib/media/draft-storage', () => ({
  cleanupDraftStorageObjects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: vi.fn(() => ({ storage: true })),
}))

vi.mock('@/features/submissions/server/drafts/draft-route-helpers', () => ({
  normalizeCreateImages: vi.fn(),
  buildUploadSignature: vi.fn(),
  validateDraftImageOwnership: vi.fn(),
}))

import { getActionAuth } from '@/lib/actions/action-auth'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getServerClient } from '@/lib/supabase-server'
import { normalizeCreateImages, buildUploadSignature, validateDraftImageOwnership } from '@/features/submissions/server/drafts/draft-route-helpers'

const mockGetActionAuth = getActionAuth as ReturnType<typeof vi.fn>
const mockNormalizeCreateImages = normalizeCreateImages as ReturnType<typeof vi.fn>
const mockBuildUploadSignature = buildUploadSignature as ReturnType<typeof vi.fn>
const mockValidateDraftImageOwnership = validateDraftImageOwnership as ReturnType<typeof vi.fn>

describe('createSubmissionDraftAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNormalizeCreateImages.mockReturnValue([])
    mockBuildUploadSignature.mockReturnValue(null)
    mockValidateDraftImageOwnership.mockResolvedValue(null)
  })

  test('rejects invalid input - missing required fields', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await createSubmissionDraftAction({})
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })

  test('rejects invalid cragId - empty string', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await createSubmissionDraftAction({ cragId: '' })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects unauthenticated request', async () => {
    mockGetActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })
    const result = await createSubmissionDraftAction({})
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  test('rejects missing userId in auth', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: {} })
    const result = await createSubmissionDraftAction({})
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toBe('Authentication required')
  })

  test('rejects non-array images', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    mockNormalizeCreateImages.mockReturnValue(null)
    const result = await createSubmissionDraftAction({ images: 'not-an-array' })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toBe('images must be an array when provided')
  })

  test('rejects failed ownership validation', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    mockNormalizeCreateImages.mockReturnValue([{ uploadedBucket: 'bucket', uploadedPath: 'path' }])
    mockValidateDraftImageOwnership.mockResolvedValue({ status: 403 } as unknown as Response)
    const result = await createSubmissionDraftAction({ images: [{ uploadedBucket: 'bucket', uploadedPath: 'path' }] })
    expect(result.success).toBe(false)
    expect(result.status).toBe(403)
  })
})

describe('deleteSubmissionDraftAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects invalid draftId', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await deleteSubmissionDraftAction('')
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects unauthenticated request', async () => {
    mockGetActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })
    const result = await deleteSubmissionDraftAction('draft-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  test('rejects missing draftId parameter', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await deleteSubmissionDraftAction('')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Draft ID is required')
    expect(result.status).toBe(400)
  })

  test.each([
    ['not_found', 404, 'Draft not found'],
    ['permission_denied', 403, 'Forbidden'],
    ['draft_not_editable', 409, 'Only draft submissions can be deleted'],
    ['draft_conflict', 409, 'The draft changed while it was being deleted'],
  ])('maps RPC detail %s to status %s', async (details, status, error) => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const mockSupabase = await getServerClient()
    const rpc = mockSupabase.rpc as unknown as ReturnType<typeof vi.fn>
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: error, details },
    })

    const result = await deleteSubmissionDraftAction('draft-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(status)
    expect(result.error).toBe(error)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_submission_draft_atomic', {
      p_draft_id: 'draft-123',
    })
    expect(cleanupDraftStorageObjects).not.toHaveBeenCalled()
  })

  test('deletes through the atomic RPC and cleans returned storage rows afterward', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const mockSupabase = await getServerClient()
    const rpc = mockSupabase.rpc as unknown as ReturnType<typeof vi.fn>
    const cleanup = [{
      storage_provider: 'r2',
      storage_bucket: 'private-bucket',
      storage_path: 'drafts/draft-123/image.jpg',
    }]
    rpc.mockResolvedValueOnce({
      data: { success: true, cleanup },
      error: null,
    })

    const result = await deleteSubmissionDraftAction('draft-123')
    expect(result.success).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_submission_draft_atomic', {
      p_draft_id: 'draft-123',
    })
    expect(cleanupDraftStorageObjects).toHaveBeenCalledWith(
      vi.mocked(getAdminClientWithAudit).mock.results[0].value,
      cleanup
    )
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cleanupDraftStorageObjects).mock.invocationCallOrder[0]
    )
  })
})

describe('publishSubmissionDraftAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects invalid draftId', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await publishSubmissionDraftAction('')
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects unauthenticated request', async () => {
    mockGetActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })
    const result = await publishSubmissionDraftAction('draft-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  test('rejects missing draftId parameter', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await publishSubmissionDraftAction('')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Draft ID is required')
    expect(result.status).toBe(400)
  })

  test('publishes draft successfully', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })

    const result = await publishSubmissionDraftAction('draft-123')
    expect(result.success).toBe(true)
    expect(result.data?.published?.imageId).toBe('test-img-id')
  })

  test('publishes image-only draft successfully when routeLineIds is empty', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const { promoteDraftToSubmission } = await import('@/features/submissions/server/drafts/draft-promote')
    ;(promoteDraftToSubmission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        published: {
          imageId: 'test-img-id',
          imageIds: ['test-img-id'],
          routeLineIds: [],
        },
      }), { status: 200 })
    )

    const result = await publishSubmissionDraftAction('draft-123')
    expect(result.success).toBe(true)
    expect(result.data?.published?.routeLineIds).toEqual([])
  })

  test('handles publish failure', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const { promoteDraftToSubmission } = await import('@/features/submissions/server/drafts/draft-promote')
    ;(promoteDraftToSubmission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Publish failed' }), { status: 500 })
    )

    const result = await publishSubmissionDraftAction('draft-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })
})

describe('deletePublishedSubmissionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects invalid imageId', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await deletePublishedSubmissionAction('')
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  test('rejects unauthenticated request', async () => {
    mockGetActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })
    const result = await deletePublishedSubmissionAction('img-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  test('rejects missing imageId parameter', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const result = await deletePublishedSubmissionAction('')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Image ID is required')
    expect(result.status).toBe(400)
  })

  test('deletes published submission successfully', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    })

    const result = await deletePublishedSubmissionAction('img-123')
    expect(result.success).toBe(true)

    global.fetch = originalFetch
  })

  test('handles delete failure', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-123' } })
    const { deleteSubmission } = await import('@/features/submissions/server/submissions/delete-submission')
    ;(deleteSubmission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Delete failed' }), { status: 500 })
    )

    const result = await deletePublishedSubmissionAction('img-123')
    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
  })
})
