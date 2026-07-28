import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import InteractiveClimbingMap from '@/components/InteractiveClimbingMap'
import type { PlacePin } from '@/lib/map/place-pins'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/map/MapLibreVectorMap', () => ({
  default: ({ onPinSelect, onReady, onViewportChange, fitBounds, focusTarget, ...props }: {
    onPinSelect: (id: string) => void
    onReady?: () => void
    onViewportChange?: (state: { zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
    fitBounds?: [[number, number], [number, number]] | null
    focusTarget?: { center: [number, number]; zoom: number } | null
    'aria-label'?: string
  }) => (
    <div role="region" aria-label={props['aria-label']} data-fit-bounds={JSON.stringify(fitBounds)} data-focus-target={JSON.stringify(focusTarget)}>
      <button type="button" onClick={() => onPinSelect('gym-1')}>Select gym</button>
      <button type="button" onClick={() => onPinSelect('crag-1')}>Select crag</button>
      <button type="button" onClick={() => {
        onViewportChange?.({ zoom: 6.8, bounds: { west: 10, south: 20, east: 30, north: 40 } })
        onReady?.()
      }}>Load viewport</button>
      <button type="button" onClick={() => {
        onViewportChange?.({ zoom: 7.2, bounds: { west: 30, south: 40, east: 50, north: 60 } })
      }}>Move viewport</button>
    </div>
  ),
}))

const places: PlacePin[] = [
  { id: 'gym-1', name: 'Training Hall', type: 'gym', latitude: 1, longitude: 1, slug: 'training-hall', country_code: 'GG', image_count: 0, route_count: 20 },
  { id: 'crag-1', name: 'Granite Bay', type: 'crag', latitude: 2, longitude: 2, slug: 'granite-bay', country_code: 'GG', image_count: 3, route_count: 10 },
]

function renderMap(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

describe('InteractiveClimbingMap destinations', () => {
  beforeEach(() => {
    mockPush.mockClear()
    vi.unstubAllGlobals()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  })

  it('shows gym availability messaging instead of a destination', async () => {
    const user = userEvent.setup()
    renderMap(<InteractiveClimbingMap initialPlacePins={places} />)

    await user.click(screen.getByRole('button', { name: 'Select gym' }))

    expect(screen.getByText('Gym guides are coming soon.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View gym' })).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps crag destinations active', async () => {
    const user = userEvent.setup()
    renderMap(<InteractiveClimbingMap initialPlacePins={places} />)

    await user.click(screen.getByRole('button', { name: 'Select crag' }))
    await user.click(screen.getByRole('button', { name: 'View crag' }))

    expect(mockPush).toHaveBeenCalledWith('/gg/granite-bay')
  })

  it('exposes synchronized place controls for keyboard users', async () => {
    const user = userEvent.setup()
    renderMap(<InteractiveClimbingMap initialPlacePins={places} />)

    const placeButton = screen.getByRole('button', { name: 'Granite Bay, crag' })
    expect(placeButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(placeButton)

    expect(placeButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Granite Bay' })).toBeInTheDocument()
  })

  it('labels the map and fits it to the user location', () => {
    renderMap(
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

  it('fetches the loaded viewport and preserves selection through a refetch', async () => {
    const user = userEvent.setup()
    const firstPin = { ...places[1], is_cluster: false, point_count: 1 }
    const secondPin = { ...places[0], is_cluster: false, point_count: 1 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pins: [firstPin] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pins: [secondPin] })))
    vi.stubGlobal('fetch', fetchMock)
    renderMap(<InteractiveClimbingMap />)

    await user.click(screen.getByRole('button', { name: 'Load viewport' }))
    await user.click(await screen.findByRole('button', { name: 'Granite Bay, crag' }))
    await user.click(screen.getByRole('button', { name: 'Move viewport' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/crags/pins?west=5&south=15&east=35&north=45&zoom=6',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(await screen.findByRole('button', { name: 'Training Hall, gym' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Granite Bay' })).toBeInTheDocument()
  })

  it('keeps fetched pins when the connection drops', async () => {
    const user = userEvent.setup()
    const pin = { ...places[1], is_cluster: false, point_count: 1 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ pins: [pin] }))))
    renderMap(<InteractiveClimbingMap />)

    await user.click(screen.getByRole('button', { name: 'Load viewport' }))
    expect(await screen.findByRole('button', { name: 'Granite Bay, crag' })).toBeInTheDocument()

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))

    expect(await screen.findByRole('button', { name: 'Granite Bay, crag' })).toBeInTheDocument()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
  })

  it('provides keyboard controls that focus server clusters', async () => {
    const user = userEvent.setup()
    const cluster = {
      id: 'cluster:6:1:1', name: null, type: 'cluster', latitude: 30, longitude: 20,
      slug: null, country_code: null, image_count: 4, route_count: 8,
      is_cluster: true, point_count: 3,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ pins: [cluster] }))))
    renderMap(<InteractiveClimbingMap />)

    await user.click(screen.getByRole('button', { name: 'Load viewport' }))
    await user.click(await screen.findByRole(
      'button',
      { name: 'Explore cluster of 3 locations near 30.00, 20.00' },
      { timeout: 5_000 }
    ))

    expect(screen.getByRole('region', { name: 'Climbing locations map' })).toHaveAttribute(
      'data-focus-target',
      JSON.stringify({ center: [20, 30], zoom: 7 })
    )
  }, 15_000)
})
