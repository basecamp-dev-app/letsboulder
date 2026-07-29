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

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CF_MEDIA_WORKER_URL: 'https://worker.example',
    CF_MEDIA_WORKER_SECRET: 'secret',
  },
}))

vi.mock('@/lib/media/r2', () => ({
  createPrivateUploadUrl: vi.fn(async (objectKey: string) => ({
    bucket: 'private-bucket',
    uploadUrl: `https://uploads.example/${objectKey}`,
    uploadHeaders: { 'content-type': 'image/jpeg' },
    expiresInSeconds: 900,
  })),
  headPrivateObject: vi.fn(async () => ({
    contentLength: 1024,
    contentType: 'image/jpeg',
    etag: 'abc123',
  })),
  getPrivateObjectStream: vi.fn(async () => new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff])) // JPEG magic bytes
      controller.close()
    }
  })),
  copyPrivateObject: vi.fn(async () => undefined),
  deletePrivateObject: vi.fn(async () => undefined),
  ensurePrivateObjectExists: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
}))

vi.mock('@/lib/media/upload-session', () => ({
  buildOriginalObjectKey: vi.fn(() => 'originals/image-123.jpg'),
  buildStagingObjectKey: vi.fn(() => 'images/staging/image-123/abc123/original.jpg'),
  buildImmutableObjectKey: vi.fn(() => 'images/assets/image-123/sha256hash/original.jpg'),
  inferExtensionFromMime: vi.fn(() => 'jpg'),
  normalizeUploadSessionRequest: vi.fn((body: unknown) => body),
}))

import { POST as createUploadSession } from '@/app/api/media/upload-sessions/route'
import { DELETE as deleteUploadSession, GET as getUploadSession } from '@/app/api/media/upload-sessions/[imageId]/route'
import { POST as completeUploadSession } from '@/app/api/media/upload-sessions/[imageId]/complete/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createPrivateUploadUrl, headPrivateObject, copyPrivateObject, deletePrivateObject, deleteObject } from '@/lib/media/r2'
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

function makeDeleteSupabase(rpcResult: { data: unknown; error: unknown }) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    rpc: vi.fn(async () => rpcResult),
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
      clientUploadId: '11111111-1111-4111-8111-111111111111',
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
      clientUploadId: '11111111-1111-4111-8111-111111111111',
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
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from: vi.fn((table: string) => {
        expect(table).toBe('images')
        return {
          insert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
          })),
        }
      }),
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: supabase as never,
      userId: null,
    } as unknown as MiddlewareResult)

    const response = await createUploadSession(makeCreateRequest({
      clientUploadId: '11111111-1111-4111-8111-111111111111',
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
      storage_path: 'images/staging/image-123/abc123/original.jpg',
      visibility: 'private',
      moderation_status: 'skipped',
      moderation_provider: 'disabled',
      processing_status: 'pending',
      client_upload_id: '11111111-1111-4111-8111-111111111111',
      upload_purpose: 'submission_image',
    }))
    expect(createPrivateUploadUrl).toHaveBeenCalledWith('images/staging/image-123/abc123/original.jpg', 'image/jpeg')
    expect(json).toEqual({
      imageId: 'image-123',
      objectKey: 'images/staging/image-123/abc123/original.jpg',
      bucket: 'private-bucket',
      uploadUrl: 'https://uploads.example/images/staging/image-123/abc123/original.jpg',
      uploadMethod: 'PUT',
      uploadHeaders: { 'content-type': 'image/jpeg' },
      expiresInSeconds: 900,
      uploadCommitted: false,
    })
  })

  test.each([
    ['draft-linked', 'pending'],
    ['draft-linked', 'failed'],
    ['published', 'ready'],
  ])('delete rejects a %s image with %s status', async (_association, status) => {
    const supabase = makeDeleteSupabase({
      data: { processing_status: status },
      error: { message: 'Image is associated with content', details: 'image_associated' },
    })

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
    expect(json.error).toBe('This image is associated with content and cannot be deleted')
    expect(supabase.rpc).toHaveBeenCalledWith('delete_unassociated_upload_image', {
      p_image_id: 'image-123',
    })
    expect(deleteObject).not.toHaveBeenCalled()
  })

  test('delete accelerates durable outbox cleanup after deleting an unassociated image', async () => {
    const supabase = makeDeleteSupabase({
      data: {
        image_id: 'image-123',
        storage_provider: 'r2',
        storage_bucket: 'private-bucket',
        storage_path: 'images/staging/image-123/session/original.jpg',
      },
      error: null,
    })

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
    expect(supabase.rpc).toHaveBeenCalledWith('delete_unassociated_upload_image', {
      p_image_id: 'image-123',
    })
    expect(deleteObject).toHaveBeenCalledWith('private-bucket', 'images/staging/image-123/session/original.jpg')
    expect(supabase.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteObject).mock.invocationCallOrder[0]
    )
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
      uploadCommitted: true,
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
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
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
                  original_key: 'images/staging/image-123/abc123/original.jpg',
                  original_mime_type: 'image/jpeg',
                  original_bytes: 1024,
                  processing_status: 'pending',
                  upload_purpose: 'submission_image',
                  checksum_sha256: null,
                },
                error: null,
              })),
            })),
          })),
          update,
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
    expect(headPrivateObject).toHaveBeenCalledWith('images/staging/image-123/abc123/original.jpg')
    expect(copyPrivateObject).toHaveBeenCalledWith('images/staging/image-123/abc123/original.jpg', 'images/assets/image-123/sha256hash/original.jpg')
    expect(deletePrivateObject).toHaveBeenCalledWith('images/staging/image-123/abc123/original.jpg')
    expect(json).toEqual({
      imageId: 'image-123',
      processingStatus: 'queued',
      moderationStatus: 'pending',
      retryable: false,
      errorCode: null,
      uploadCommitted: true,
    })
    expect(rpc).toHaveBeenCalledWith('finalize_media_upload', {
      p_image_id: 'image-123',
      p_original_key: 'images/assets/image-123/sha256hash/original.jpg',
      p_checksum_sha256: expect.any(String),
    })
  })
test('complete always queues moderation as pending', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'queued', attempts: 0, max_attempts: 5 },
      error: null,
    }))
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
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
                  original_key: 'images/staging/image-123/abc123/original.jpg',
                  original_mime_type: 'image/jpeg',
                  original_bytes: 1024,
                  processing_status: 'pending',
                  upload_purpose: 'crag_image',
                  checksum_sha256: null,
                },
                error: null,
              })),
            })),
          })),
          update,
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
    expect(json.moderationStatus).toBe('pending')
    expect(rpc).toHaveBeenCalledWith('finalize_media_upload', expect.objectContaining({ p_image_id: 'image-123' }))
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
                original_key: 'images/assets/image-123/sha256hash/original.jpg',
                processing_status: 'ready',
                moderation_status: 'skipped',
                visibility: 'public',
                status: 'approved',
                upload_purpose: 'submission_image',
                checksum_sha256: 'sha256hash',
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
      uploadCommitted: true,
    })
    expect(headPrivateObject).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('complete fails when durable queueing fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('rpc failed') }))
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
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
                original_key: 'images/staging/image-123/abc123/original.jpg',
                original_mime_type: 'image/jpeg',
                original_bytes: 1024,
                processing_status: 'pending',
                upload_purpose: 'submission_image',
                checksum_sha256: null,
              },
              error: null,
            })),
          })),
        })),
        update,
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
