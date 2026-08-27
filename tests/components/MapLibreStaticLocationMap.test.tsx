import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MapLibreStaticLocationMap from '@/components/map/MapLibreStaticLocationMap'

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      constructor() {
        throw new Error('Failed to initialize WebGL')
      }
    },
    Marker: class {},
  },
}))

describe('MapLibreStaticLocationMap capability failure', () => {
  it('reports WebGL absence without escaping the climb location region', async () => {
    const onFailure = vi.fn()

    expect(() => render(
      <MapLibreStaticLocationMap
        point={{ latitude: 51.1, longitude: 0.1 }}
        onFailure={onFailure}
      />
    )).not.toThrow()

    await waitFor(() => expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'webgl-unavailable',
      severity: 'fatal',
    })))
  })
})
