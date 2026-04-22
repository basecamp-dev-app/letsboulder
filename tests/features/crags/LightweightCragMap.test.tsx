import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LightweightCragMap from '@/components/LightweightCragMap'

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicComponent() {
    return <div data-testid="mock-map-node" />
  },
}))

vi.mock('react-leaflet', () => ({
  useMapEvents: () => ({
    getBounds: () => ({
      getNorth: () => 0,
      getSouth: () => 0,
      getEast: () => 0,
      getWest: () => 0,
    }),
    getZoom: () => 15,
  }),
}))

vi.mock('@/lib/map/base-layer', () => ({
  getMapBaseLayerConfig: () => ({
    imageryUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    imageryAttribution: 'Example',
    labelsUrl: null,
    labelsAttribution: null,
  }),
}))

vi.mock('@/lib/map/place-pins', () => ({
  buildPinFeatures: () => [],
  isClusterFeature: () => false,
}))

describe('LightweightCragMap height modes', () => {
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

  it('uses fill height mode when requested', () => {
    const { container } = render(
      <div className="h-[66vh]">
        <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} heightMode="fill" />
      </div>
    )

    const wrapper = container.querySelector('.lightweight-crag-map')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('h-full')
    expect(wrapper?.className).toContain('min-h-0')
  })

  it('keeps additive height classes in fill mode', () => {
    const { container } = render(
      <div className="h-[66vh]">
        <LightweightCragMap pins={pins} initialCenter={[48.85, 2.35]} heightMode="fill" heightClassName="ring-1" />
      </div>
    )

    const wrapper = container.querySelector('.lightweight-crag-map')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('h-full')
    expect(wrapper?.className).toContain('ring-1')
  })
})
