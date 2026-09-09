import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MapLibreVectorMap from '@/components/map/MapLibreVectorMap'

type MapEventHandler = (...args: unknown[]) => void

const mapMocks = vi.hoisted(() => ({
  failConstruction: false,
  instances: [] as Array<{ handlers: Map<string, MapEventHandler> }>,
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  cameraForBounds: vi.fn((_bounds: unknown, _options: unknown) => ({ zoom: 7.2 })),
  setData: vi.fn(),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => {
  const interaction = () => ({ enable: vi.fn(), disable: vi.fn() })

  class MockMap {
    handlers = new Map<string, MapEventHandler>()
    dragPan = interaction()
    scrollZoom = interaction()
    boxZoom = interaction()
    dragRotate = interaction()
    keyboard = interaction()
    doubleClickZoom = interaction()
    touchZoomRotate = interaction()

    constructor() {
      if (mapMocks.failConstruction) throw new Error('Failed to initialize WebGL')
      mapMocks.instances.push(this)
    }

    addControl() {}
    remove() {}
    addSource() {}
    addLayer() {}
    setMinZoom() {}
    setMaxZoom() {}
    getCanvas() { return { style: { cursor: '' } } }
    getSource() { return { setData: mapMocks.setData } }
    getZoom() { return 6 }
    getBounds() {
      return {
        getNorth: () => 40,
        getSouth: () => 20,
        getEast: () => 30,
        getWest: () => 10,
      }
    }
    cameraForBounds(bounds: unknown, options: unknown) {
      return mapMocks.cameraForBounds(bounds, options)
    }
    fitBounds(bounds: unknown, options: unknown) {
      mapMocks.fitBounds(bounds, options)
    }
    easeTo(options: unknown) {
      mapMocks.easeTo(options)
    }
    on(event: string, layerOrHandler: string | MapEventHandler, handler?: MapEventHandler) {
      if (typeof layerOrHandler === 'string') {
        if (handler) this.handlers.set(`${event}:${layerOrHandler}`, handler)
      } else {
        this.handlers.set(event, layerOrHandler)
      }
      return this
    }
  }

  class MockAttributionControl {}
  class MockNavigationControl {}

  return {
    Map: MockMap,
    AttributionControl: MockAttributionControl,
    NavigationControl: MockNavigationControl,
    setWorkerUrl: mapMocks.setWorkerUrl,
    default: {
      Map: MockMap,
      AttributionControl: MockAttributionControl,
      NavigationControl: MockNavigationControl,
      setWorkerUrl: mapMocks.setWorkerUrl,
    },
  }
})

const emptyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [],
}

describe('MapLibreVectorMap', () => {
  beforeEach(() => {
    mapMocks.failConstruction = false
    mapMocks.instances.length = 0
    mapMocks.fitBounds.mockClear()
    mapMocks.easeTo.mockClear()
    mapMocks.cameraForBounds.mockClear()
    mapMocks.cameraForBounds.mockReturnValue({ zoom: 7.2 })
    mapMocks.setData.mockClear()
    mapMocks.setWorkerUrl.mockClear()
    vi.useRealTimers()
  })

  it('reports WebGL absence without throwing into the page boundary', async () => {
    mapMocks.failConstruction = true
    const onFailure = vi.fn()

    expect(() => render(
      <MapLibreVectorMap
        center={[0, 0]}
        zoom={2}
        pinsGeoJson={emptyGeoJson}
        onFailure={onFailure}
      />
    )).not.toThrow()

    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1))
    expect(mapMocks.setWorkerUrl).toHaveBeenCalledWith('/maplibre/maplibre-gl-worker.mjs')
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'webgl-unavailable',
      severity: 'fatal',
      error: expect.objectContaining({ message: 'Failed to initialize WebGL' }),
    }))
  })

  it('prefetches from cluster bounds before a 350ms fit and skips the manual-pan debounce for that move', async () => {
    const onClusterSelect = vi.fn()
    const onViewportChange = vi.fn()

    render(
      <MapLibreVectorMap
        center={[0, 0]}
        zoom={6}
        pinsGeoJson={emptyGeoJson}
        clustersGeoJson={emptyGeoJson}
        onClusterSelect={onClusterSelect}
        onViewportChange={onViewportChange}
      />
    )

    await waitFor(() => expect(mapMocks.instances).toHaveLength(1))
    const map = mapMocks.instances[0]

    expect(mapMocks.setWorkerUrl).toHaveBeenCalledWith('/maplibre/maplibre-gl-worker.mjs')

    act(() => {
      map.handlers.get('load')?.()
    })
    expect(onViewportChange).toHaveBeenCalledTimes(1)

    const clusterBounds = [[19, 29], [21, 31]] as [[number, number], [number, number]]
    act(() => {
      map.handlers.get('click:letsboulder-cluster-hit-targets')?.({
        features: [{
          geometry: { type: 'Point', coordinates: [20, 30] },
          properties: { minLng: 19, minLat: 29, maxLng: 21, maxLat: 31 },
        }],
      })
    })

    expect(onClusterSelect).toHaveBeenCalledWith({ bounds: clusterBounds, queryZoom: 8 })
    expect(mapMocks.fitBounds).toHaveBeenCalledWith(clusterBounds, {
      padding: 28,
      maxZoom: 12,
      duration: 350,
    })
    expect(onClusterSelect.mock.invocationCallOrder[0]).toBeLessThan(mapMocks.fitBounds.mock.invocationCallOrder[0])

    vi.useFakeTimers()
    act(() => {
      map.handlers.get('moveend')?.()
      vi.advanceTimersByTime(300)
    })
    expect(onViewportChange).toHaveBeenCalledTimes(1)

    act(() => {
      map.handlers.get('moveend')?.()
      vi.advanceTimersByTime(249)
    })
    expect(onViewportChange).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onViewportChange).toHaveBeenCalledTimes(2)
  })
})
