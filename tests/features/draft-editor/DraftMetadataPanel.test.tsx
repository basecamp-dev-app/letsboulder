// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftMetadataPanel } from '@/features/draft-editor/components/DraftMetadataPanel'

const { cragSelectorMock } = vi.hoisted(() => ({
  cragSelectorMock: vi.fn((props: unknown) => props),
}))

vi.mock('@/features/submissions/components/CragSelector', () => ({
  default: (props: unknown) => {
    cragSelectorMock(props)
    return null
  },
}))

vi.mock('@/features/submissions/components/AtlasContextCard', () => ({ default: () => null }))
vi.mock('@/features/submissions/components/SectorSelector', () => ({ default: () => null }))
vi.mock('@/components/map/MapLibreLocationPicker', () => ({ default: () => null }))
vi.mock('@/features/submissions/components/editor/LocationSearchBar', () => ({ LocationSearchBar: () => null }))

describe('DraftMetadataPanel', () => {
  it('uses effective custom-image GPS when creating a crag', () => {
    render(
      <DraftMetadataPanel
        atlasSync={{ atlas: null, nearbyCrag: null, loading: false, error: null }}
        selectedCrag={null}
        showCragSelector
        cragId={null}
        sectorId={null}
        activeImageLocationMode="custom"
        activeDraftImageId="draft-image-1"
        latitude=""
        longitude=""
        customGpsByImageId={{ 'draft-image-1': { latitude: 51.0997358, longitude: 0.1870059 } }}
        effectiveMarkerPosition={[51.0997358, 0.1870059]}
        mapOpen={false}
        searchQuery=""
        searchingLocation={false}
        locationSearchError={null}
        routeType="boulder"
        onShowCragSelector={vi.fn()}
        onSelectCrag={vi.fn()}
        onCreateCrag={vi.fn()}
        onSectorChange={vi.fn()}
        onLocationModeChange={vi.fn()}
        onLatitudeChange={vi.fn()}
        onLongitudeChange={vi.fn()}
        onCustomGpsChange={vi.fn()}
        onMapPositionChange={vi.fn()}
        onMapOpenChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSearchLocation={vi.fn()}
        onRouteTypeChange={vi.fn()}
      />,
    )

    expect(cragSelectorMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      latitude: 51.0997358,
      longitude: 0.1870059,
    }))
  })
})
