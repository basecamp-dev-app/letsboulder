import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InteractiveClimbingMap from '@/components/InteractiveClimbingMap'
import type { PlacePin } from '@/lib/map/place-pins'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/map/MapLibreVectorMap', () => ({
  default: ({ onPinSelect, fitBounds, ...props }: {
    onPinSelect: (id: string) => void
    fitBounds?: [[number, number], [number, number]] | null
    'aria-label'?: string
  }) => (
    <div role="region" aria-label={props['aria-label']} data-fit-bounds={JSON.stringify(fitBounds)}>
      <button type="button" onClick={() => onPinSelect('gym-1')}>Select gym</button>
      <button type="button" onClick={() => onPinSelect('crag-1')}>Select crag</button>
    </div>
  ),
}))

const places: PlacePin[] = [
  { id: 'gym-1', name: 'Training Hall', type: 'gym', latitude: 1, longitude: 1, slug: 'training-hall', country_code: 'GG', image_count: 0, route_count: 20 },
  { id: 'crag-1', name: 'Granite Bay', type: 'crag', latitude: 2, longitude: 2, slug: 'granite-bay', country_code: 'GG', image_count: 3, route_count: 10 },
]

describe('InteractiveClimbingMap destinations', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('shows gym availability messaging instead of a destination', async () => {
    const user = userEvent.setup()
    render(<InteractiveClimbingMap initialPlacePins={places} />)

    await user.click(screen.getByRole('button', { name: 'Select gym' }))

    expect(screen.getByText('Gym guides are coming soon.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View gym' })).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps crag destinations active', async () => {
    const user = userEvent.setup()
    render(<InteractiveClimbingMap initialPlacePins={places} />)

    await user.click(screen.getByRole('button', { name: 'Select crag' }))
    await user.click(screen.getByRole('button', { name: 'View crag' }))

    expect(mockPush).toHaveBeenCalledWith('/gg/granite-bay')
  })

  it('exposes synchronized place controls for keyboard users', async () => {
    const user = userEvent.setup()
    render(<InteractiveClimbingMap initialPlacePins={places} />)

    const placeButton = screen.getByRole('button', { name: 'Granite Bay, crag' })
    expect(placeButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(placeButton)

    expect(placeButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Granite Bay' })).toBeInTheDocument()
  })

  it('labels the map and fits it to the user location', () => {
    render(
      <InteractiveClimbingMap
        initialPlacePins={places}
        userLocation={{ latitude: 48.86, longitude: 2.36 }}
      />
    )

    expect(screen.getByRole('region', { name: 'Climbing locations map' })).toHaveAttribute(
      'data-fit-bounds',
      JSON.stringify([[2.36, 48.86], [2.36, 48.86]])
    )
  })
})
