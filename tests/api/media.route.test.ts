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

interface MediaRow {
  id?: string
  url?: string
  created_by: string | null
  moderation_status: string | null
  processing_status: string
  visibility: string
  status: string
}

function mediaRow(created_by: string | null, moderation_status: string | null, overrides: Partial<MediaRow> = {}): MediaRow {
  return { created_by, moderation_status, processing_status: 'ready', visibility: 'public', status: 'approved', ...overrides }
}

function createImagesQuery(rows: MediaRow[]) {
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

function createCragImagesQuery(rows: Array<{ id: string; url: string; linked_image_id: string | null; source_image_id: string | null; legacy_published_at: string | null }> = []) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
  }
}

function createAdminClient(rows: MediaRow[], cragImageRows: Array<{ id: string; url: string; linked_image_id: string | null; source_image_id: string | null; legacy_published_at: string | null }> = []) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'images') {
        return createImagesQuery(rows)
      }

      if (table === 'crag_images') {
        return createCragImagesQuery(cragImageRows)
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
    createClient.mockReturnValue(createAdminClient([mediaRow('user-1', 'pending', { processing_status: 'processing', visibility: 'private', status: 'pending' })]))
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
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'approved')]))
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
    const response = await OPTIONS()

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  test('returns 400 for invalid media path (missing bucket)', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media//photo.jpg'),
      { params: Promise.resolve({ bucket: '', path: ['photo.jpg'] }) }
    )

    expect(response.status).toBe(400)
  })

  test('returns 400 for invalid media path (missing object)', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private-bucket/'),
      { params: Promise.resolve({ bucket: 'private-bucket', path: [] }) }
    )

    expect(response.status).toBe(400)
  })

  test('private media returns 404 when user has no access', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient('user-1'))
    createClient.mockReturnValue(createAdminClient([mediaRow('other-user', 'pending', { processing_status: 'processing', visibility: 'private', status: 'pending' })]))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private-bucket/originals/photo.jpg'),
      { params: Promise.resolve({ bucket: 'private-bucket', path: ['originals', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(404)
  })

  test('public media allows anonymous access with approved images', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'approved')]))
    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([4, 5, 6])),
        ContentType: 'image/jpeg',
        ContentLength: 3,
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg'),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('public media with pending images returns 404', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'pending')]))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg'),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(404)
  })

  test('does not authorize a raw crag image locator through a different deliverable linked image', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    let imageQueryCount = 0
    createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'crag_images') return createCragImagesQuery([
          { id: 'crag-image', url: 'private://legacy-bucket/stale.jpg', linked_image_id: 'linked-image', source_image_id: null, legacy_published_at: null },
        ])
        if (table === 'images') {
          imageQueryCount += 1
          const rows = imageQueryCount === 1
            ? [{ ...mediaRow(null, 'approved'), id: 'linked-image', url: 'private://legacy-bucket/approved.jpg' }]
            : []
          return { select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: rows, error: null })),
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ limit: vi.fn(async () => ({ data: rows, error: null })) })) })),
          })) }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/legacy-bucket/stale.jpg'),
      { params: Promise.resolve({ bucket: 'legacy-bucket', path: ['stale.jpg'] }) },
    )

    expect(response.status).toBe(404)
  })

  test('public media with approved moderation but unfinished processing returns 404', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'approved', { processing_status: 'processing' })]))

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg'),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(404)
  })

  test('public media accepts skipped moderation when all public states are ready', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'skipped')]))
    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([4, 5, 6])),
        ContentType: 'image/jpeg',
        ContentLength: 3,
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg'),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(200)
  })
})

describe('Media transform behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('public media caches with long TTL', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient(null))
    createClient.mockReturnValue(createAdminClient([mediaRow(null, 'approved')]))
    createR2Client.mockReturnValue({
      send: vi.fn(async () => ({
        Body: createR2Body(new Uint8Array([4, 5, 6])),
        ContentType: 'image/jpeg',
        ContentLength: 3,
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/public-bucket/derived/photo.jpg'),
      { params: Promise.resolve({ bucket: 'public-bucket', path: ['derived', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })
})

describe('Media error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 500 on database error', async () => {
    getServerClientFromRequest.mockReturnValue(createAuthClient('user-1'))
    createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(async () => {
              throw new Error('Database connection failed')
            }),
          })),
        })),
      })),
    })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/media/private-bucket/originals/photo.jpg'),
      { params: Promise.resolve({ bucket: 'private-bucket', path: ['originals', 'photo.jpg'] }) }
    )

    expect(response.status).toBe(500)
  })
})
