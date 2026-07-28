import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadPlacePins } from '@/lib/map/load-place-pins'

describe('loadPlacePins', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends viewport parameters and the React Query abort signal', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pins: [] })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadPlacePins({
      bounds: { west: -5, south: 40, east: 5, north: 50 },
      zoom: 7,
    }, signal)).resolves.toEqual({ features: [] })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/crags/pins?west=-5&south=40&east=5&north=50&zoom=7',
      { signal }
    )
  })

  it('rejects a payload that does not match the pin/cluster union', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ pins: [{ type: 'cluster' }] }))))

    await expect(loadPlacePins({
      bounds: { west: -5, south: 40, east: 5, north: 50 },
      zoom: 7,
    })).rejects.toThrow('Invalid map pins response')
  })
})
