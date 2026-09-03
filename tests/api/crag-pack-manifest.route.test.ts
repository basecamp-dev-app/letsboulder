import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CragPackManifest } from '@/types/crag-pack-manifest'

const { loadCragPackManifest, reportError } = vi.hoisted(() => ({
  loadCragPackManifest: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/features/offline/server/crag-pack-manifest', () => ({ loadCragPackManifest }))
vi.mock('@/lib/errors', () => ({ reportError }))

import { GET } from '@/app/api/offline-packs/crags/[cragId]/manifest/route'

const CRAG_ID = '01234567-89ab-4def-8123-456789abcdef'

function request(ifNoneMatch?: string) {
  return new NextRequest(`http://localhost/api/offline-packs/crags/${CRAG_ID}/manifest`, {
    headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : undefined,
  })
}

function manifest(): CragPackManifest {
  return {
    schemaVersion: 2,
    minReaderVersion: 2,
    canonicalPath: '/gb/test-crag',
    requiredOfflineRoutes: ['/offline/crag?id=test'],
    reader: { family: 'letsboulder-offline-field-guide', minimumVersion: 2 },
    metadata: {
      crag: {
        id: CRAG_ID, name: 'Test Crag', slug: 'test-crag', countryCode: 'GB', country: 'United Kingdom',
        regionName: null, subArea: null, rockType: null, type: 'boulder', tideDependency: null,
        description: null, accessNotes: null, coordinates: { latitude: null, longitude: null, visibility: 'hidden' },
        updatedAt: null,
      },
      sectors: [], climbs: [], images: [], routeLines: [],
    },
    assets: [], type: 'crag', packId: `crag:${CRAG_ID}`, cragId: CRAG_ID, cragName: 'Test Crag',
    cragVersionHash: 'abc123', exactTotalBytes: 0, estimatedBytes: 0, mediaUrls: [], climbs: [], contentVersion: 'abc123',
    generatedAt: '2026-07-29T12:00:00.000Z',
  }
}

describe('GET /api/offline-packs/crags/[cragId]/manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadCragPackManifest.mockResolvedValue(manifest())
  })

  it('validates the crag UUID before loading data', async () => {
    const response = await GET(request(), { params: Promise.resolve({ cragId: 'not-a-uuid' }) })

    expect(response.status).toBe(400)
    expect(loadCragPackManifest).not.toHaveBeenCalled()
  })

  it('returns a public versioned manifest with its strong ETag', async () => {
    const response = await GET(request(), { params: Promise.resolve({ cragId: CRAG_ID }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"abc123"')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    expect(await response.json()).toEqual(manifest())
  })

  it.each(['"abc123"', 'W/"abc123"', '"older", W/"abc123"'])('returns 304 for matching If-None-Match %s', async (etag) => {
    const response = await GET(request(etag), { params: Promise.resolve({ cragId: CRAG_ID }) })

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('"abc123"')
    expect(await response.text()).toBe('')
  })

  it('returns 404 for an ineligible or missing crag', async () => {
    loadCragPackManifest.mockResolvedValueOnce(null)
    const response = await GET(request(), { params: Promise.resolve({ cragId: CRAG_ID }) })
    expect(response.status).toBe(404)
  })

  it('sanitizes database failures', async () => {
    loadCragPackManifest.mockRejectedValueOnce(new Error('database secret'))
    const response = await GET(request(), { params: Promise.resolve({ cragId: CRAG_ID }) })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      extra: { cragId: CRAG_ID },
    }))
  })
})
