import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'image-123'),
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  createErrorResponse: vi.fn((error: unknown, message: string) =>
    NextResponse.json(
      { error: message, detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  ),
  reportError: vi.fn(),
}))

vi.mock('@/lib/media/config', () => ({
  getMediaStorageConfig: vi.fn(() => ({ privateBucket: 'private-bucket' })),
}))

vi.mock('@/lib/media/r2', () => ({
  createPrivateUploadUrl: vi.fn(async (objectKey: string) => ({
    bucket: 'private-bucket',
    uploadUrl: `https://uploads.example/${objectKey}`,
    uploadHeaders: { 'content-type': 'image/jpeg' },
    expiresInSeconds: 900,
  })),
  deleteObject: vi.fn(async () => undefined),
  ensurePrivateObjectExists: vi.fn(async () => undefined),
}))

vi.mock('@/lib/media/worker-enqueue', () => ({
  enqueueMediaWorkerFastPath: vi.fn(),
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CF_MEDIA_WORKER_URL: 'https://worker.example',
    CF_MEDIA_WORKER_SECRET: 'secret',
  },
}))

vi.mock('@/lib/media/upload-session', () => ({
  buildOriginalObjectKey: vi.fn(() => 'originals/image-123.jpg'),
  normalizeUploadSessionRequest: vi.fn((body: unknown) => body),
}))

import { POST as createUploadSession } from '@/app/api/media/upload-sessions/route'
import { DELETE as deleteUploadSession, GET as getUploadSession } from '@/app/api/media/upload-sessions/[imageId]/route'
import { POST as completeUploadSession } from '@/app/api/media/upload-sessions/[imageId]/complete/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createPrivateUploadUrl, deleteObject, ensurePrivateObjectExists } from '@/lib/media/r2'
import { enqueueMediaWorkerFastPath } from '@/lib/media/worker-enqueue'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

function makeAuthedSupabase() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn(),
  }
}

function makeCreateRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/media/upload-sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

function makeCompleteRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/media/upload-sessions/image-123/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

function makeGetRequest() {
  return new NextRequest('http://localhost:3000/api/media/upload-sessions/image-123')
}

describe('Media upload session routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(enqueueMediaWorkerFastPath).mockResolvedValue(true)
    vi.mocked(getAdminClientWithAudit).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    } as never)
  })

  test('create returns 401 when auth user is missing', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from: vi.fn(),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as MiddlewareResult)

    const response = await createUploadSession(makeCreateRequest({
      purpose: 'submission_image',
      contentType: 'image/jpeg',
      byteSize: 1024,
      width: 1200,
      height: 900,
    }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Authentication required')
  })

  test('create returns 400 when draft uploads omit draftId', async () => {
    const supabase = makeAuthedSupabase()
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await createUploadSession(makeCreateRequest({
      purpose: 'draft_image',
      contentType: 'image/jpeg',
      byteSize: 1024,
      width: 1200,
      height: 900,
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('draftId is required for draft uploads')
  })

  test('create persists the image row and returns upload details', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn((table: string) => {
        expect(table).toBe('images')
        return { insert }
      }),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await createUploadSession(makeCreateRequest({
      purpose: 'submission_image',
      contentType: 'image/jpeg',
      byteSize: 1024,
      width: 1200,
      height: 900,
      captureDate: '2026-01-01T00:00:00.000Z',
      gpsData: { latitude: 49.2, longitude: -2.1 },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-123',
      created_by: 'user-1',
      storage_bucket: 'private-bucket',
      storage_path: 'originals/image-123.jpg',
      visibility: 'private',
      moderation_status: 'skipped',
      moderation_provider: 'disabled',
      processing_status: 'pending',
    }))
    expect(createPrivateUploadUrl).toHaveBeenCalledWith('originals/image-123.jpg', 'image/jpeg')
    expect(json).toEqual({
      imageId: 'image-123',
      objectKey: 'originals/image-123.jpg',
      bucket: 'private-bucket',
      uploadUrl: 'https://uploads.example/originals/image-123.jpg',
      uploadMethod: 'PUT',
      uploadHeaders: { 'content-type': 'image/jpeg' },
      expiresInSeconds: 900,
    })
  })

  test('delete rejects processed images', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'image-123',
                created_by: 'user-1',
                original_bucket: 'private-bucket',
                original_key: 'originals/image-123.jpg',
                processing_status: 'ready',
                moderation_status: 'skipped',
                visibility: 'public',
                status: 'approved',
              },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await deleteUploadSession(
      new NextRequest('http://localhost:3000/api/media/upload-sessions/image-123', {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'test-csrf-token' },
      }),
      { params: Promise.resolve({ imageId: 'image-123' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe('Processed images cannot be deleted from this endpoint')
    expect(deleteObject).not.toHaveBeenCalled()
  })

  test('delete removes original object and image row', async () => {
    const deleteQuery = { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn((table: string) => {
        if (table !== 'images') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'image-123',
                  created_by: 'user-1',
                  original_bucket: 'private-bucket',
                  original_key: 'originals/image-123.jpg',
                  processing_status: 'pending',
                },
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => deleteQuery),
        }
      }),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await deleteUploadSession(
      new NextRequest('http://localhost:3000/api/media/upload-sessions/image-123', {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'test-csrf-token' },
      }),
      { params: Promise.resolve({ imageId: 'image-123' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(deleteObject).toHaveBeenCalledWith('private-bucket', 'originals/image-123.jpg')
    expect(json).toEqual({ success: true })
  })

  test('get returns the owner a sanitized status from the latest job', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'image-123', created_by: 'user-1', processing_status: 'failed' },
              error: null,
            })),
          })),
        })),
      })),
    }
    const maybeSingle = vi.fn(async () => ({
      data: { status: 'failed', attempts: 5, max_attempts: 5 },
      error: null,
    }))
    const limit = vi.fn(() => ({ maybeSingle }))
    const order = vi.fn(() => ({ limit }))
    const jobTypeEq = vi.fn(() => ({ order }))
    const imageIdEq = vi.fn(() => ({ eq: jobTypeEq }))
    const admin = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: imageIdEq })) })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)
    vi.mocked(getAdminClientWithAudit).mockReturnValue(admin as never)

    const response = await getUploadSession(makeGetRequest(), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      imageId: 'image-123',
      processingStatus: 'failed',
      moderationStatus: 'skipped',
      retryable: false,
      errorCode: 'MEDIA_PROCESSING_FAILED',
    })
    expect(json).not.toHaveProperty('last_error')
    expect(getAdminClientWithAudit).toHaveBeenCalledOnce()
  })

  test('get does not read jobs for an image owned by another user', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'image-123', created_by: 'user-2', processing_status: 'queued' },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await getUploadSession(makeGetRequest(), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })

    expect(response.status).toBe(403)
    expect(getAdminClientWithAudit).not.toHaveBeenCalled()
  })

  test('complete queues private ingest with moderation skipped', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'queued', attempts: 0, max_attempts: 5 },
      error: null,
    }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      rpc,
      from: vi.fn((table: string) => {
        if (table !== 'images') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'image-123',
                  created_by: 'user-1',
                  original_bucket: 'private-bucket',
                  original_key: 'originals/image-123.jpg',
                  processing_status: 'pending',
                },
                error: null,
              })),
            })),
          })),
        }
      }),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await completeUploadSession(makeCompleteRequest({ purpose: 'submission_image' }), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(ensurePrivateObjectExists).toHaveBeenCalledWith('originals/image-123.jpg')
    expect(json).toEqual({
      imageId: 'image-123',
      processingStatus: 'queued',
      moderationStatus: 'skipped',
      retryable: false,
      errorCode: null,
    })
    expect(rpc).toHaveBeenCalledWith('queue_media_ingest_job', {
      p_image_id: 'image-123',
      p_original_bucket: 'private-bucket',
      p_original_key: 'originals/image-123.jpg',
      p_storage_provider: 'r2',
      p_purpose: 'submission_image',
      p_triggered_by_user_id: 'user-1',
      p_trigger: 'upload',
      p_auto_approve: false,
    })
    expect(enqueueMediaWorkerFastPath).toHaveBeenCalledWith({
      imageId: 'image-123',
      originalBucket: 'private-bucket',
      originalKey: 'originals/image-123.jpg',
      storageProvider: 'r2',
      purpose: 'submission_image',
      triggeredByUserId: 'user-1',
      trigger: 'upload',
    })
  })

  test('complete succeeds when immediate worker dispatch is unavailable', async () => {
    vi.mocked(enqueueMediaWorkerFastPath).mockResolvedValue(false)
    const rpc = vi.fn(async () => ({
      data: { status: 'queued', attempts: 0, max_attempts: 5 },
      error: null,
    }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'image-123',
                created_by: 'user-1',
                original_bucket: 'private-bucket',
                original_key: 'originals/image-123.jpg',
                processing_status: 'pending',
              },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await completeUploadSession(makeCompleteRequest({ purpose: 'draft_image' }), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).processingStatus).toBe('queued')
  })

  test('complete always skips moderation', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'queued', attempts: 0, max_attempts: 5 },
      error: null,
    }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      rpc,
      from: vi.fn((table: string) => {
        if (table !== 'images') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'image-123',
                  created_by: 'user-1',
                  original_bucket: 'private-bucket',
                  original_key: 'originals/image-123.jpg',
                  processing_status: 'pending',
                },
                error: null,
              })),
            })),
          })),
        }
      }),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await completeUploadSession(makeCompleteRequest({ purpose: 'crag_image' }), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.moderationStatus).toBe('skipped')
    expect(rpc).toHaveBeenCalledWith('queue_media_ingest_job', expect.objectContaining({
      p_auto_approve: false,
      p_purpose: 'crag_image',
    }))
  })

  test('complete returns ready without queueing an already processed image', async () => {
    const rpc = vi.fn()
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'image-123',
                created_by: 'user-1',
                original_bucket: 'private-bucket',
                original_key: 'originals/image-123.jpg',
                processing_status: 'ready',
                moderation_status: 'skipped',
                visibility: 'public',
                status: 'approved',
              },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await completeUploadSession(makeCompleteRequest({ purpose: 'submission_image' }), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      imageId: 'image-123',
      processingStatus: 'ready',
      moderationStatus: 'skipped',
      retryable: false,
      errorCode: null,
    })
    expect(ensurePrivateObjectExists).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('complete fails when durable queueing fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('rpc failed') }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'image-123',
                created_by: 'user-1',
                original_bucket: 'private-bucket',
                original_key: 'originals/image-123.jpg',
                processing_status: 'pending',
              },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await completeUploadSession(makeCompleteRequest({ purpose: 'submission_image' }), {
      params: Promise.resolve({ imageId: 'image-123' }),
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to queue image for ingest')
  })
})
