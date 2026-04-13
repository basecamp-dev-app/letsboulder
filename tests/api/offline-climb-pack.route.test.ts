import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockCreateClient = vi.fn()

const { getAdminClientWithAudit } = vi.hoisted(() => ({
  getAdminClientWithAudit: vi.fn(() => mockCreateClient()),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

vi.mock('@/lib/supabase-server', () => ({
  getAdminClientWithAudit,
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

vi.mock('@/features/climb/lib/canonical-logic', () => ({
  getCanonicalRouteFaces: vi.fn(async () => ({
    aliasClimbIds: [],
    previewFaces: [],
  })),
}))

vi.mock('@/lib/offline/tiles', () => ({
  buildTileManifestForPins: vi.fn(() => null),
}))

vi.mock('@/lib/media-proxy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media-proxy')>('@/lib/media-proxy')
  return {
    ...actual,
    estimateCompressedImageBytes: vi.fn(() => 123),
  }
})

import { GET } from '@/app/api/offline-packs/climbs/[id]/route'

function createVisibilityBuilder(result: { data: { id: string } | null; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => ({
          in: vi.fn(() => ({
            maybeSingle: vi.fn(async () => result),
          })),
        })),
      })),
    })),
  }
}

function createVisibleSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'climbs') {
        return createVisibilityBuilder({ data: { id: 'climb-1' }, error: null })
      }
      if (table === 'crags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'crag-1', country_code: 'GB', slug: 'crag-one', name: 'Crag One' },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === 'images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { latitude: null, longitude: null },
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    rpc: vi.fn(async () => ({
      data: {
        climb: { id: 'climb-1', name: 'Visible Climb', grade: '6A', route_type: 'boulder', description: null, slug: 'visible-climb' },
        primary_image: {
          id: 'image-1',
          url: 'https://example.com/image.jpg',
          width: 1000,
          height: 800,
          natural_width: 1000,
          natural_height: 800,
          crag_id: 'crag-1',
          created_by: null,
          is_anonymous_submission: false,
          contribution_credit_platform: null,
          contribution_credit_handle: null,
          face_directions: null,
        },
        faces: [],
        primary_route_lines: [],
        summary: { total_faces: 1, total_routes: 0 },
      },
      error: null,
    })),
  }
}

describe('Offline climb pack route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 200 for visible climbs', async () => {
    mockCreateClient.mockReturnValue(createVisibleSupabase())

    const response = await GET(new NextRequest('http://localhost:3000/api/offline-packs/climbs/climb-1'), {
      params: Promise.resolve({ id: 'climb-1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.climb.id).toBe('climb-1')
    expect(json.offline_pack.imageFirstUrl).toBe('/gb/crag-one/i/image-1?climb=climb-1')
    expect(json.offline_pack.offlineLaunchUrl).toBe('/gb/crag-one/i/image-1?climb=climb-1')
  })

  test('returns 404 for non-visible climbs', async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn(() => createVisibilityBuilder({ data: null, error: null })),
      rpc: vi.fn(),
    })

    const response = await GET(new NextRequest('http://localhost:3000/api/offline-packs/climbs/climb-2'), {
      params: Promise.resolve({ id: 'climb-2' }),
    })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Climb not found')
  })
})
