import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

const { createR2Client } = vi.hoisted(() => ({
  createR2Client: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}))

vi.mock('@/lib/media/r2', () => ({
  createR2Client,
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    NEXT_PUBLIC_MEDIA_CDN_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example',
    R2_PRIVATE_BUCKET: 'private-bucket',
    R2_PUBLIC_BUCKET: 'public-bucket',
  },
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { GET, OPTIONS } from '@/app/api/media/[bucket]/[...path]/route'

function createAuthClient(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })),
    },
  }
}

function createImagesQuery(rows: Array<{ created_by: string | null; moderation_status: string | null }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: rows, error: null })),
        })),
      })),
    })),
  }
}

function createCragImagesQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(async () => ({ data: [], error: null })),
      })),
    })),
  }
}

function createAdminClient(rows: Array<{ created_by: string | null; moderation_status: string | null }>) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'images') {
        return createImagesQuery(rows)
      }

      if (table === 'crag_images') {
        return createCragImagesQuery()
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function createR2Body(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes
    },
  }
}

describe('Media proxy route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('omits CORS headers for hostile-origin private media requests', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient('user-1'))
    createClient.mockReturnValue(createAdminClient([{ created_by: 'user-1', moderation_status: 'pending' }]))
    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([1, 2, 3])),
        ContentType: 'image/jpeg',
        ContentLength: 3,
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private-bucket/originals/photo.jpg', {
        headers: { origin: 'https://evil.example' },
      }),
      { params: Promise.resolve({ bucket: 'private-bucket', path: ['originals', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('private not-found responses do not expose credentialed CORS', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([]))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private-bucket/originals/missing.jpg', {
        headers: { origin: 'https://evil.example' },
      }),
      { params: Promise.resolve({ bucket: 'private-bucket', path: ['originals', 'missing.jpg'] }) }
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  test('public media responses use wildcard CORS without credentials', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([{ created_by: null, moderation_status: 'approved' }]))
    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([4, 5, 6])),
        ContentType: 'image/jpeg',
        ContentLength: 3,
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg', {
        headers: { origin: 'https://evil.example' },
      }),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  test('options does not reflect hostile origins for private access', async () => {
    const response = await OPTIONS(
      new NextRequest('http://localhost:3000/api/media/private-bucket/originals/photo.jpg', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })
})
