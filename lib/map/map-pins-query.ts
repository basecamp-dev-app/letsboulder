import type { MapViewportQuery } from '@/lib/map/map-bounds'
import { loadPlacePins } from '@/lib/map/load-place-pins'

export function mapPinsQueryKey(viewport: MapViewportQuery) {
  const { bounds, zoom } = viewport
  return ['map-pins', zoom, bounds.west, bounds.south, bounds.east, bounds.north] as const
}

export function mapPinsQueryOptions(viewport: MapViewportQuery) {
  return {
    queryKey: mapPinsQueryKey(viewport),
    queryFn: ({ signal }: { signal: AbortSignal }) => loadPlacePins(viewport, signal),
    placeholderData: (previousData: Awaited<ReturnType<typeof loadPlacePins>> | undefined) => previousData,
    staleTime: 60_000,
  }
}
