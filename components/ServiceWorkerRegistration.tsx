'use client'

import { useEffect } from 'react'
import {
  clearRegisteredServiceWorkers,
  SERVICE_WORKER_URL,
  shouldEnableServiceWorker,
} from '@/lib/offline/service-worker-client'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!shouldEnableServiceWorker()) {
      void clearRegisteredServiceWorkers()
      return
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    if (document.readyState === 'complete') {
      void registerServiceWorker()
      return
    }

    const handleLoad = () => {
      void registerServiceWorker()
    }

    window.addEventListener('load', handleLoad, { once: true })

    return () => {
      window.removeEventListener('load', handleLoad)
    }
  }, [])

  return null
}
