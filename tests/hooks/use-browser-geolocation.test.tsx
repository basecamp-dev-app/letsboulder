import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBrowserGeolocation } from '@/hooks/use-browser-geolocation'

function LocationHarness({ enabled }: { enabled: boolean }) {
  const { location, status } = useBrowserGeolocation(enabled)
  return (
    <div data-testid="location" data-status={status}>
      {location ? `${location.latitude},${location.longitude}` : ''}
    </div>
  )
}

describe('useBrowserGeolocation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not request location while disabled', () => {
    const getCurrentPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    render(<LocationHarness enabled={false} />)

    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'idle')
  })

  it('returns the location after an enabled request succeeds', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({
          coords: { latitude: 48.86, longitude: 2.36 },
        } as GeolocationPosition)),
      },
    })

    render(<LocationHarness enabled={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'success')
    })
    expect(screen.getByTestId('location')).toHaveTextContent('48.86,2.36')
  })
})
