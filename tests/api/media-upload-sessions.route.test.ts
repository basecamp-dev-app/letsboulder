import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'image-123'),
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
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
  getMediaModerationConfig: vi.fn(() => ({ enabled: false, provider: 'disabled' })),
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
import { DELETE as deleteUploadSession } from '@/app/api/media/upload-sessions/[imageId]/route'
import { POST as completeUploadSession } from '@/app/api/media/upload-sessions/[imageId]/complete/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createPrivateUploadUrl, deleteObject, ensurePrivateObjectExists } from '@/lib/media/r2'
import { getMediaModerationConfig } from '@/lib/media/config'

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

describe('Media upload session routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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
      visibility: 'public',
      moderation_status: 'approved',
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

  test('complete queues ingest when moderation is disabled', async () => {
    vi.mocked(getMediaModerationConfig).mockReturnValue({ enabled: false, provider: 'disabled', failOpen: false })
    const updateQuery = { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
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
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => updateQuery),
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
    expect(json).toEqual({ success: true, imageId: 'image-123', status: 'queued' })
    expect(fetch).toHaveBeenCalledWith(
      'https://worker.example/enqueue',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('complete queues ingest when moderation requires review', async () => {
    vi.mocked(getMediaModerationConfig).mockReturnValue({ enabled: true, provider: 'aws_rekognition', failOpen: false })
    const updateQuery = { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
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
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => updateQuery),
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
    expect(json).toEqual({ success: true, imageId: 'image-123', status: 'queued' })
    expect(fetch).toHaveBeenCalledWith(
      'https://worker.example/enqueue',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
