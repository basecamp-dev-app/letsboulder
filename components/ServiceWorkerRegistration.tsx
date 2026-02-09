'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    registerServiceWorker()
  }, [])

  return null
}
