import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LocationPicker from '@/app/submit/components/LocationPicker'

vi.mock('@/components/map/MapLibreLocationPicker', () => ({
  default: () => <div data-testid="maplibre-location-picker" />,
}))

describe('LocationPicker', () => {
  it('labels the location search and announces manual search errors', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Search failed', { status: 500 })))

    render(<LocationPicker initialGps={null} onConfirm={vi.fn()} />)

    const searchInput = await screen.findByLabelText('Search for a location')
    await user.type(searchInput, 'Alpine Valley')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed')
  })

  it('announces crag search network errors', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')))

    render(
      <LocationPicker
        initialGps={null}
        onConfirm={vi.fn()}
        regionName="Alpine Valley"
        cragName="Sunrise Wall"
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Use "Sunrise Wall" crag location' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to search location')
  })
})
