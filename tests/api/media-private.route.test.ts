import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { resolveUserIdWithFallback } = vi.hoisted(() => ({
  resolveUserIdWithFallback: vi.fn(),
}))

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

const { createR2Client } = vi.hoisted(() => ({
  createR2Client: vi.fn(),
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback,
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
}))

vi.mock('@/lib/media/r2', () => ({
  createR2Client,
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { GET } from '@/app/api/media/private/route'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSupabaseClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    })),
  }
}

function createR2Body(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('/api/media/private', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 400 when draftId is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?path=drafts/draft-1/photo.jpg')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing draftId or path' })
  })

  test('returns 400 when path is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing draftId or path' })
  })

  test('returns 401 when unauthenticated', async () => {
    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: null, authError: new Error('No session') })
    vi.mocked(getServerClientFromRequest).mockReturnValue(makeSupabaseClient())

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1&path=photo.jpg')
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' })
  })

  test('returns 404 when image row not found', async () => {
    const supabase = makeSupabaseClient()
    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
    vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof supabase.from>)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1&path=photo.jpg')
    )

    expect(response.status).toBe(404)
  })

  test('returns 404 when user cannot access draft', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'submission_draft_images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'img-1', draft_id: 'draft-1', storage_bucket: 'private', storage_path: 'photo.jpg' },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }

        if (table === 'submission_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1', user_id: 'other-user' }, error: null })),
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

        return { select: vi.fn(() => makeThenableResult({ data: null, error: null })) }
      }),
    }

    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
    vi.mocked(getServerClientFromRequest).mockReturnValue(supabase as unknown as ReturnType<typeof getServerClientFromRequest>)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1&path=photo.jpg')
    )

    expect(response.status).toBe(404)
  })

  test('returns 200 with image for draft owner', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'submission_draft_images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'img-1', draft_id: 'draft-1', storage_bucket: 'private', storage_path: 'photo.jpg' },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }

        if (table === 'submission_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1', user_id: 'user-1' }, error: null })),
              })),
            })),
          }
        }

        return { select: vi.fn(() => makeThenableResult({ data: null, error: null })) }
      }),
    }

    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
    vi.mocked(getServerClientFromRequest).mockReturnValue(supabase as unknown as ReturnType<typeof getServerClientFromRequest>)

    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([1, 2, 3])),
        ContentType: 'image/jpeg',
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1&path=photo.jpg')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  })

  test('returns 200 with image for collaborator', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'submission_draft_images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'img-1', draft_id: 'draft-1', storage_bucket: 'private', storage_path: 'photo.jpg' },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }

        if (table === 'submission_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1', user_id: 'owner-user' }, error: null })),
              })),
            })),
          }
        }

        if (table === 'submission_draft_collaborators') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { draft_id: 'draft-1' }, error: null })),
                })),
              })),
            })),
          }
        }

        return { select: vi.fn(() => makeThenableResult({ data: null, error: null })) }
      }),
    }

    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-2', authError: null })
    vi.mocked(getServerClientFromRequest).mockReturnValue(supabase as unknown as ReturnType<typeof getServerClientFromRequest>)

    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([1, 2, 3])),
        ContentType: 'image/png',
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private?draftId=draft-1&path=photo.jpg')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })
})