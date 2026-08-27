import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MapLibreVectorMap from '@/components/map/MapLibreVectorMap'

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      constructor() {
        throw new Error('Failed to initialize WebGL')
      }
    },
    AttributionControl: class {},
    NavigationControl: class {},
  },
}))

describe('MapLibreVectorMap capability failure', () => {
  it('reports WebGL absence without throwing into the page boundary', async () => {
    const onFailure = vi.fn()
    const emptyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: [],
    }

    expect(() => render(
      <MapLibreVectorMap
        center={[0, 0]}
        zoom={2}
        pinsGeoJson={emptyGeoJson}
        onFailure={onFailure}
      />
    )).not.toThrow()

    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1))
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'webgl-unavailable',
      severity: 'fatal',
      error: expect.objectContaining({ message: 'Failed to initialize WebGL' }),
    }))
  })
})
