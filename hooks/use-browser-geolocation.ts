'use client'

import { useEffect, useState } from 'react'

export interface BrowserLocationPoint {
  latitude: number
  longitude: number
}

export function useBrowserGeolocation(enabled = true) {
  const [location, setLocation] = useState<BrowserLocationPoint | null>(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return
    if (!navigator.geolocation) {
      if (process.env.NODE_ENV === 'development') console.warn('Geolocation is not available in this browser.')
      return
    }

    let cancelled = false

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') console.warn('Geolocation request failed.', error)
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
