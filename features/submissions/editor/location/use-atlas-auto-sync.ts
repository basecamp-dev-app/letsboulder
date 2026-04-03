'use client'

import { useEffect, useState } from 'react'

export interface AtlasContext {
  continentName: string | null
  unRegionName: string | null
  adminRegionName: string | null
  countryId: string | null
  countryCode: string | null
  countryName: string | null
}

export interface NearbyCragContext {
  id: string
  name: string
  distanceMeters: number | null
  dominantRouteType: string | null
}

export interface AtlasAutoSyncResult {
  atlas: AtlasContext | null
  nearbyCrag: NearbyCragContext | null
  loading: boolean
  error: string | null
}

export function useAtlasAutoSync(lat?: number | null, lng?: number | null): AtlasAutoSyncResult {
  const [result, setResult] = useState<Omit<AtlasAutoSyncResult, 'loading'>>({
    atlas: null,
    nearbyCrag: null,
    error: null,
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (lat == null || lng == null) {
      setResult({ atlas: null, nearbyCrag: null, error: null })
      return
    }

    let cancelled = false

    async function resolveLocation() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
        const response = await fetch(`/api/regions/by-location?${params.toString()}`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))

        if (cancelled) return

        setResult({
          atlas: data?.atlas ?? null,
          nearbyCrag: data?.nearbyCrag ?? null,
          error: data?.error ?? null,
        })
      } catch {
        if (!cancelled) {
          setResult((previous) => ({ ...previous, error: 'Failed to resolve location' }))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void resolveLocation()

    return () => {
      cancelled = true
    }
  }, [lat, lng])

  return { ...result, loading }
}
