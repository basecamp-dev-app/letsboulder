import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LightweightCragMap from '@/components/LightweightCragMap'

vi.mock('leaflet', () => ({
  latLngBounds: vi.fn(() => ({
    pad: vi.fn(() => 'mock-bounds'),
  })),
  divIcon: vi.fn((options: unknown) => options),
}))

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    void loader
    return function MockDynamicComponent(props: Record<string, unknown>) {
      return <div data-testid="dynamic-node" {...props} />
    }
  },
}))

vi.mock('react-leaflet', async () => {
  const Marker = ({ children }: { children?: unknown }) => <div data-testid="mock-marker">{children as string | number | boolean | null | undefined}</div>
  const TileLayer = () => <div data-testid="mock-tile-layer" />
  const ZoomControl = () => <div data-testid="mock-zoom-control" />
  const MapContainer = () => <div data-testid="mock-map-container" />
  const useMapEvents = () => ({
    getBounds: () => ({
      getNorth: () => 0,
      getSouth: () => 0,
      getEast: () => 0,
      getWest: () => 0,
    }),
    getZoom: () => 15,
  })

  return { MapContainer, Marker, TileLayer, ZoomControl, useMapEvents }
})

vi.mock('@/lib/map/base-layer', () => ({
  getMapBaseLayerConfig: () => ({
    imageryUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    imageryAttribution: 'Example',
    labelsUrl: null,
    labelsAttribution: null,
    mode: 'satellite',
  }),
}))

vi.mock('@/lib/map/place-pins', () => ({
  buildPinFeatures: (pins: Array<{ id: string; latitude: number; longitude: number; name: string }>) => pins.map((pin) => ({
    geometry: { coordinates: [pin.longitude, pin.latitude] },
    properties: { cluster: false, id: pin.id, name: pin.name },
  })),
  isClusterFeature: () => false,
}))

describe('LightweightCragMap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const pins = [
    {
      id: 'pin-1',
      latitude: 48.85,
      longitude: 2.35,
      label: '1',
      primaryImageId: 'image-1',
    },
  ]

  it('uses intrinsic height by default', () => {
    const { container } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} />
    )

    const wrapper = container.querySelector('.lightweight-crag-map')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('h-[260px]')
    expect(wrapper?.className).toContain('md:h-[320px]')
  })

  it('propagates fill height through the outer wrapper', () => {
    const { container } = render(
      <div className="h-[66vh]">
        <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} heightMode="fill" />
      </div>
    )

    const outerWrapper = container.firstElementChild?.firstElementChild
    const mapWrapper = container.querySelector('.lightweight-crag-map')
    expect(outerWrapper?.className).toContain('h-full')
    expect(outerWrapper?.className).toContain('min-h-0')
    expect(mapWrapper?.className).toContain('h-full')
    expect(mapWrapper?.className).toContain('min-h-0')
  })

  it('keeps additive height classes in fill mode', () => {
    const { container } = render(
      <div className="h-[66vh]">
        <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} heightMode="fill" heightClassName="ring-1" />
      </div>
    )

    const wrapper = container.querySelector('.lightweight-crag-map')
    expect(wrapper?.className).toContain('h-full')
    expect(wrapper?.className).toContain('ring-1')
  })

  it('shows a static preview before the interactive map is mounted', () => {
    const { container, queryAllByTestId } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} />
    )

    expect(container.querySelector('[data-testid="static-map-preview"]')).not.toBeNull()
    expect(container.textContent).toContain('Loading interactive map')
    expect(container.querySelector('.lightweight-crag-map')).not.toBeNull()
    expect(queryAllByTestId('mock-marker')).toHaveLength(0)
  })

  it('keeps the static preview visible through the preview delay', () => {
    const { container, queryAllByTestId } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} />
    )

    vi.advanceTimersByTime(200)

    expect(container.querySelector('[data-testid="static-map-preview"]')).not.toBeNull()
    expect(queryAllByTestId('mock-marker')).toHaveLength(0)
  })
})
