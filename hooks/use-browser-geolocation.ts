'use client'

import { useEffect, useState } from 'react'

export interface BrowserLocationPoint {
  latitude: number
  longitude: number
}

export function useBrowserGeolocation(enabled = true) {
  const [location, setLocation] = useState<BrowserLocationPoint | null>(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return

    let cancelled = false

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        if (!cancelled) setLocation(null)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )

    return () => {
      cancelled = true
    }
  }, [enabled])

  return location
}
