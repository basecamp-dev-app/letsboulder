import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import LightweightCragMap from '@/components/LightweightCragMap'

vi.mock('@/components/map/MapLibreVectorMap', () => ({
  default: (props: {
    pinsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point>
    onReady?: () => void
    onPinSelect?: (id: string) => void
  }) => {
    window.setTimeout(() => props.onReady?.(), 0)
    const firstPinId = props.pinsGeoJson.features[0]?.properties?.selectId as string | undefined
    return (
      <button
        type="button"
        data-testid="mock-maplibre-map"
        data-pin-count={props.pinsGeoJson.features.length}
        onClick={() => firstPinId ? props.onPinSelect?.(firstPinId) : undefined}
      />
    )
  },
}))

vi.mock('@/lib/map/place-pins', () => ({
  buildPinFeatures: (pins: Array<{ id: string; latitude: number; longitude: number; name: string }>) => pins.map((pin) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pin.longitude, pin.latitude] },
    properties: { cluster: false, id: pin.id, name: pin.name },
  })),
  isClusterFeature: (feature: { properties: { cluster?: boolean } }) => feature.properties.cluster === true,
}))

describe('LightweightCragMap', () => {
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

  it('shows a loading state before the vector map is ready', () => {
    const { container } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} />
    )

    expect(container.querySelector('[data-testid="map-loading-state"]')).not.toBeNull()
    expect(container.querySelector('.lightweight-crag-map')).not.toBeNull()
  })

  it('renders the interactive vector map after map init', async () => {
    const { container, getByTestId } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} />
    )

    await waitFor(() => {
      expect(container.querySelector('[data-testid="map-loading-state"]')).toBeNull()
    })
    expect(getByTestId('mock-maplibre-map')).toHaveAttribute('data-pin-count', '1')
  })

  it('selects the primary image id when a pin is clicked', async () => {
    const onPinSelect = vi.fn()
    const { getByTestId } = render(
      <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} onPinSelect={onPinSelect} />
    )

    fireEvent.click(getByTestId('mock-maplibre-map'))

    expect(onPinSelect).toHaveBeenCalledWith('image-1')
  })
})
