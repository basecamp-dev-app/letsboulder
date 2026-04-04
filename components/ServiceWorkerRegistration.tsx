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
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
        let reloading = false

        const reloadForUpdate = () => {
          if (reloading) return
          reloading = true
          window.location.reload()
        }

        const activateWaitingWorker = () => {
          if (!registration.waiting) return
          navigator.serviceWorker.addEventListener('controllerchange', reloadForUpdate, { once: true })
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        await registration.update().catch(() => undefined)

        if (registration.waiting) {
          activateWaitingWorker()
          return
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && registration.waiting) {
              activateWaitingWorker()
            }
          })
        })
      } catch (_error) {
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
