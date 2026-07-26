import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import HomeMapHero from '@/features/home/components/HomeMapHero'
import type { BrowserGeolocationStatus } from '@/hooks/use-browser-geolocation'

vi.mock('@/components/MapViewport', () => ({
  default: ({ showUserLocation, onGeolocationStatusChange }: {
    showUserLocation?: boolean
    onGeolocationStatusChange?: (status: BrowserGeolocationStatus) => void
  }) => (
    <div data-testid="map-viewport" data-show-user-location={String(showUserLocation)}>
      <button type="button" onClick={() => onGeolocationStatusChange?.('success')}>Grant location</button>
      <button type="button" onClick={() => onGeolocationStatusChange?.('error')}>Deny location</button>
    </div>
  ),
}))

describe('HomeMapHero', () => {
  it('requests location only after the user activates the control', async () => {
    const user = userEvent.setup()
    render(<HomeMapHero />)

    expect(screen.getByTestId('map-viewport')).toHaveAttribute('data-show-user-location', 'false')

    await user.click(screen.getByRole('button', { name: 'Find climbing near me' }))

    expect(screen.getByTestId('map-viewport')).toHaveAttribute('data-show-user-location', 'true')
  })

  it('reports a failed request and allows another attempt', async () => {
    const user = userEvent.setup()
    render(<HomeMapHero />)

    await user.click(screen.getByRole('button', { name: 'Find climbing near me' }))
    await user.click(screen.getByRole('button', { name: 'Deny location' }))

    expect(screen.getByRole('status')).toHaveTextContent('Location unavailable')
    expect(screen.getByTestId('map-viewport')).toHaveAttribute('data-show-user-location', 'false')

    await user.click(screen.getByRole('button', { name: 'Try location again' }))
    expect(screen.getByTestId('map-viewport')).toHaveAttribute('data-show-user-location', 'true')
  })
})
