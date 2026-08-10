import { normalizeViewportQuery, type MapViewportQuery } from '@/lib/map/map-bounds'
import { loadPlacePins } from '@/lib/map/load-place-pins'

export function mapPinsQueryKey(viewport: MapViewportQuery) {
  const { bounds, zoom } = viewport
  return ['map-pins', zoom, bounds.west, bounds.south, bounds.east, bounds.north] as const
}

export function mapPinsQueryOptions(viewport: MapViewportQuery) {
  const normalizedViewport = normalizeViewportQuery(viewport)
  return {
    queryKey: mapPinsQueryKey(normalizedViewport),
    queryFn: ({ signal }: { signal: AbortSignal }) => loadPlacePins(normalizedViewport, signal),
    placeholderData: (previousData: Awaited<ReturnType<typeof loadPlacePins>> | undefined) => previousData,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  }
}
