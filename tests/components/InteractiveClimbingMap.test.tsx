import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import InteractiveClimbingMap from '@/components/InteractiveClimbingMap'
import type { PlacePin, ViewportPlacePin, ViewportPinCluster } from '@/lib/map/place-pins'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/map/MapLibreVectorMap', () => ({
  default: ({ onPinSelect, onReady, onViewportChange, onClusterSelect, fitBounds, focusBounds, ...props }: {
    onPinSelect: (id: string) => void
    onReady?: () => void
    onViewportChange?: (state: { zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
    onClusterSelect?: (selection: { bounds: [[number, number], [number, number]]; queryZoom: number }) => void
    fitBounds?: [[number, number], [number, number]] | null
    focusBounds?: [[number, number], [number, number]] | null
    'aria-label'?: string
  }) => (
    <div
      role="region"
      aria-label={props['aria-label']}
      data-fit-bounds={JSON.stringify(fitBounds)}
      data-focus-bounds={JSON.stringify(focusBounds)}
    >
      <button type="button" onClick={() => onPinSelect('gym-1')}>Select gym</button>
      <button type="button" onClick={() => onPinSelect('crag-1')}>Select crag</button>
      <button type="button" onClick={() => {
        onViewportChange?.({ zoom: 6.8, bounds: { west: 10, south: 20, east: 30, north: 40 } })
        onReady?.()
      }}>Load viewport</button>
      <button type="button" onClick={() => {
        onViewportChange?.({ zoom: 7.2, bounds: { west: 30, south: 40, east: 50, north: 60 } })
      }}>Move viewport</button>
      <button type="button" onClick={() => {
        onClusterSelect?.({ bounds: [[19, 29], [21, 31]], queryZoom: 9 })
      }}>Select cluster bounds</button>
    </div>
  ),
}))

const places: PlacePin[] = [
  { id: 'gym-1', name: 'Training Hall', type: 'gym', latitude: 1, longitude: 1, slug: 'training-hall', country_code: 'GG', image_count: 0, route_count: 20 },
  { id: 'crag-1', name: 'Granite Bay', type: 'crag', latitude: 2, longitude: 2, slug: 'granite-bay', country_code: 'GG', image_count: 3, route_count: 10 },
]

function viewportPin(place: PlacePin): ViewportPlacePin {
  return {
    ...place,
    is_cluster: false,
    point_count: 1,
    min_lng: null,
    min_lat: null,
    max_lng: null,
    max_lat: null,
  }
}

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

  it('preserves previous pins without showing the global spinner during a viewport refetch', async () => {
    const user = userEvent.setup()
    const firstPin = viewportPin(places[1])
    const secondPin = viewportPin(places[0])
    let resolveSecond: ((response: Response) => void) | undefined
    const secondResponse = new Promise<Response>((resolve) => { resolveSecond = resolve })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pins: [firstPin] })))
      .mockReturnValueOnce(secondResponse)
    vi.stubGlobal('fetch', fetchMock)
    renderMap(<InteractiveClimbingMap />)

    await user.click(screen.getByRole('button', { name: 'Load viewport' }))
    await user.click(await screen.findByRole('button', { name: 'Granite Bay, crag' }))
    await user.click(screen.getByRole('button', { name: 'Move viewport' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Loading crags...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Granite Bay, crag' })).toBeInTheDocument()

    resolveSecond?.(new Response(JSON.stringify({ pins: [secondPin] })))

    expect(await screen.findByRole('button', { name: 'Training Hall, gym' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Granite Bay' })).toBeInTheDocument()
  })

  it('prefetches the bounds-derived cluster viewport immediately', async () => {
    const user = userEvent.setup()
    const cluster: ViewportPinCluster = {
      id: 'cluster:6:1:1', name: null, type: 'cluster', latitude: 30, longitude: 20,
      slug: null, country_code: null, image_count: 4, route_count: 8,
      is_cluster: true, point_count: 3,
      min_lng: 19, min_lat: 29, max_lng: 21, max_lat: 31,
    }
    const childPin = viewportPin(places[1])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pins: [cluster] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pins: [childPin] })))
    vi.stubGlobal('fetch', fetchMock)
    renderMap(<InteractiveClimbingMap />)

    await user.click(screen.getByRole('button', { name: 'Load viewport' }))
    expect(await screen.findByRole('button', { name: 'Explore cluster of 3 locations near 30.00, 20.00' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Select cluster bounds' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/crags/pins?west=18.5&south=28.5&east=21.5&north=31.5&zoom=9',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(screen.queryByText('Loading crags...')).not.toBeInTheDocument()
  })

  it('keeps fetched pins when the connection drops', async () => {
    const user = userEvent.setup()
    const pin = viewportPin(places[1])
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

  it('provides keyboard controls that focus the server-provided cluster bounds', async () => {
    const user = userEvent.setup()
    const cluster: ViewportPinCluster = {
      id: 'cluster:6:1:1', name: null, type: 'cluster', latitude: 30, longitude: 20,
      slug: null, country_code: null, image_count: 4, route_count: 8,
      is_cluster: true, point_count: 3,
      min_lng: 19, min_lat: 29, max_lng: 21, max_lat: 31,
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
      'data-focus-bounds',
      JSON.stringify([[19, 29], [21, 31]])
    )
  }, 15_000)
})
