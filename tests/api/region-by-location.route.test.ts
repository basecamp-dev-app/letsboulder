import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ getServerClientFromRequest }))

import { GET } from '@/app/api/regions/by-location/route'

function makeClient(activeCrag: boolean) {
  const cragBuilder = {
    eq: vi.fn(() => cragBuilder),
    is: vi.fn(() => cragBuilder),
    maybeSingle: vi.fn(async () => ({
      data: activeCrag ? { id: 'crag-1' } : null,
      error: null,
    })),
  }
  const climbsBuilder = {
    eq: vi.fn(async () => ({ data: [], error: null })),
  }

  return {
    rpc: vi.fn(async () => ({
      data: {
        country: { id: 'country-1', name: 'United Kingdom', iso_a2: 'GB' },
        crag: { id: 'crag-1', name: 'Stale crag', distance_meters: 10 },
      },
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === 'crags') return { select: vi.fn(() => cragBuilder) }
      if (table === 'climbs') return { select: vi.fn(() => climbsBuilder) }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('region by location', () => {
  beforeEach(() => vi.resetAllMocks())

  test('drops an inactive crag returned by stale upload context data', async () => {
    const client = makeClient(false)
    getServerClientFromRequest.mockReturnValue(client)

    const response = await GET(new NextRequest('http://localhost/api/regions/by-location?lat=51.5&lng=-0.1'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ nearbyCrag: null, error: null })
    expect(client.from).not.toHaveBeenCalledWith('climbs')
  })

  test('keeps an active crag returned by upload context data', async () => {
    const client = makeClient(true)
    getServerClientFromRequest.mockReturnValue(client)

    const response = await GET(new NextRequest('http://localhost/api/regions/by-location?lat=51.5&lng=-0.1'))

    await expect(response.json()).resolves.toMatchObject({
      nearbyCrag: { id: 'crag-1', name: 'Stale crag', distanceMeters: 10 },
      error: null,
    })
  })
})
