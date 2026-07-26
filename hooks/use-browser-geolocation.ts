'use client'

import { useEffect, useState } from 'react'

export interface BrowserLocationPoint {
  latitude: number
  longitude: number
}

export type BrowserGeolocationStatus = 'idle' | 'requesting' | 'success' | 'error' | 'unsupported'

export function useBrowserGeolocation(enabled = true) {
  const [location, setLocation] = useState<BrowserLocationPoint | null>(null)
  const [status, setStatus] = useState<BrowserGeolocationStatus>('idle')

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return
    let cancelled = false
    let requestTimer: ReturnType<typeof setTimeout>

    if (!navigator.geolocation) {
      if (process.env.NODE_ENV === 'development') console.warn('Geolocation is not available in this browser.')
      requestTimer = setTimeout(() => {
        if (!cancelled) setStatus('unsupported')
      }, 0)
    } else {
      requestTimer = setTimeout(() => {
        if (cancelled) return
        setStatus('requesting')
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return
            setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
            setStatus('success')
          },
          (error) => {
            if (process.env.NODE_ENV === 'development') console.warn('Geolocation request failed.', error)
            if (!cancelled) {
              setLocation(null)
              setStatus('error')
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        )
      }, 0)
    }

    return () => {
      cancelled = true
      clearTimeout(requestTimer)
    }
  }, [enabled])

  return { location, status }
}
