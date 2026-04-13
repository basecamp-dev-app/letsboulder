import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockCreateClient = vi.fn()
const mockBuildClimbOfflinePack = vi.fn()

const { getAdminClientWithAudit } = vi.hoisted(() => ({
  getAdminClientWithAudit: vi.fn(() => mockCreateClient()),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

vi.mock('@/lib/supabase-server', () => ({
  getAdminClientWithAudit,
}))

vi.mock('@/lib/offline/build-climb-pack', () => ({
  buildClimbOfflinePack: (...args: unknown[]) => mockBuildClimbOfflinePack(...args),
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { GET } from '@/app/api/offline-packs/crags/[id]/route'

function createCragQuery(result: { data: { id: string; name: string; slug: string; country_code: string } | null; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => result),
      })),
    })),
  }
}

function createClimbsQuery(result: { data: Array<{ id: string; name: string; slug: string | null; status: string | null }>; error: unknown }) {
  const order = vi.fn(async () => result)
  const statusFilter = { order }
  const deletedFilter = { in: vi.fn(() => statusFilter) }
  const cragFilter = { is: vi.fn(() => deletedFilter) }

  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => cragFilter),
    })),
    order,
    statusFilter,
  }
}

describe('Offline crag pack route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('includes only visible climbs in the manifest', async () => {
    const climbsQuery = createClimbsQuery({
      data: [{ id: 'climb-1', name: 'Visible Climb', slug: 'visible-climb', status: 'active' }],
      error: null,
    })

    mockCreateClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'crags') {
          return createCragQuery({ data: { id: 'crag-1', name: 'Crag One', slug: 'crag-one', country_code: 'GB' }, error: null })
        }
        if (table === 'climbs') {
          return climbsQuery
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    mockBuildClimbOfflinePack.mockResolvedValue({
      offline_pack: {
        climbName: 'Visible Climb',
        canonicalPath: '/gb/crag-one/visible-climb',
        offlineLaunchUrl: '/gb/crag-one/i/image-1?climb=climb-1',
        pageUrl: '/gb/crag-one/visible-climb',
        manifestUrl: '/api/offline-packs/climbs/climb-1',
        version: 'version-1',
        estimatedBytes: 123,
        mediaCount: 1,
        coverImageUrl: 'https://example.com/image.jpg',
        primaryPin: {
          climbId: 'climb-1',
          climbName: 'Visible Climb',
          canonicalPath: '/gb/crag-one/i/image-1?climb=climb-1',
          coverImageUrl: 'https://example.com/image.jpg',
          latitude: 49.1,
          longitude: -2.2,
        },
        mediaUrls: ['https://example.com/image.jpg'],
      },
      primary_image: {
        id: 'image-1',
        url: 'https://example.com/image.jpg',
        width: 1000,
        height: 800,
        natural_width: 1000,
        natural_height: 800,
      },
      faces: [],
    })

    const response = await GET(new NextRequest('http://localhost:3000/api/offline-packs/crags/crag-1'), {
      params: Promise.resolve({ id: 'crag-1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.climbCount).toBe(1)
    expect(json.climbs).toHaveLength(1)
    expect(json.climbs[0].climbId).toBe('climb-1')
    expect(json.offlineLaunchUrl).toBe('/gb/crag-one/i/image-1?climb=climb-1')
    expect(climbsQuery.statusFilter.order).toHaveBeenCalledOnce()
    expect(mockBuildClimbOfflinePack).toHaveBeenCalledWith('climb-1')
  })
})
