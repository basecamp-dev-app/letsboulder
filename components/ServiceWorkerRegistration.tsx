'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  SERVICE_WORKER_URL,
  shouldEnableServiceWorker,
} from '@/lib/offline/service-worker-client'

type BrowserServiceWorkerRegistration = globalThis.ServiceWorkerRegistration

declare global {
  interface Window {
    __letsboulderHasActiveUploads?: boolean
  }
}

const UPLOAD_ACTIVITY_EVENT = 'letsboulder:upload-activity'

function isFormActive() {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return false

  return Boolean(activeElement.closest('form, [contenteditable="true"]'))
}

function isUnsafeToReload(hasActiveUploads: boolean) {
  return hasActiveUploads || isFormActive()
}

export default function ServiceWorkerRegistration() {
  const pathname = usePathname()
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [deferredUntilNavigation, setDeferredUntilNavigation] = useState(false)
  const [deferredForBusyState, setDeferredForBusyState] = useState(false)
  const hasActiveUploadsRef = useRef(Boolean(window.__letsboulderHasActiveUploads))
  const waitingRegistrationRef = useRef<BrowserServiceWorkerRegistration | null>(null)
  const activationRequestedRef = useRef(false)
  const reloadPendingRef = useRef(false)
  const reloadingRef = useRef(false)
  const lastPathnameRef = useRef(pathname)

  const reloadIfSafe = useCallback(() => {
    if (!reloadPendingRef.current || reloadingRef.current) return
    if (isUnsafeToReload(hasActiveUploadsRef.current)) {
      setDeferredForBusyState(true)
      return
    }

    reloadingRef.current = true
    window.location.reload()
  }, [])

  const activateWaitingWorker = useCallback(() => {
    const waiting = waitingRegistrationRef.current?.waiting
    if (!waiting) return false

    if (isUnsafeToReload(hasActiveUploadsRef.current)) {
      setDeferredForBusyState(true)
      return false
    }

    activationRequestedRef.current = true
    reloadPendingRef.current = true
    setDeferredForBusyState(false)
    waiting.postMessage({ type: 'SKIP_WAITING' })
    return true
  }, [])

  useEffect(() => {
    if (!shouldEnableServiceWorker()) {
      return
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
        const showUpdatePrompt = () => {
          waitingRegistrationRef.current = registration
          setUpdateAvailable(true)
        }

        const reloadForUpdate = () => {
          if (!activationRequestedRef.current) return
          reloadPendingRef.current = true
          reloadIfSafe()
        }

        navigator.serviceWorker.addEventListener('controllerchange', reloadForUpdate)

        await registration.update().catch(() => undefined)

        if (registration.waiting) {
          showUpdatePrompt()
          return
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && registration.waiting) {
              showUpdatePrompt()
            }
          })
        })
      } catch {
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
  }, [reloadIfSafe])

  useEffect(() => {
    const handleUploadActivity = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail?.active !== 'boolean') return
      window.__letsboulderHasActiveUploads = event.detail.active
      hasActiveUploadsRef.current = event.detail.active
      if (!event.detail.active) {
        reloadIfSafe()
      }
    }

    window.addEventListener(UPLOAD_ACTIVITY_EVENT, handleUploadActivity)
    return () => window.removeEventListener(UPLOAD_ACTIVITY_EVENT, handleUploadActivity)
  }, [reloadIfSafe])

  useEffect(() => {
    if (lastPathnameRef.current === pathname) {
      return
    }
    lastPathnameRef.current = pathname

    if (reloadPendingRef.current) {
      queueMicrotask(reloadIfSafe)
      return
    }

    if (updateAvailable || deferredUntilNavigation) {
      queueMicrotask(() => {
        setDeferredUntilNavigation(false)
        void activateWaitingWorker()
      })
    }
  }, [activateWaitingWorker, deferredUntilNavigation, pathname, reloadIfSafe, updateAvailable])

  if (!updateAvailable) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[4500] mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-xl shadow-slate-900/15 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-50">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Update available</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {deferredForBusyState
              ? 'The update will wait until uploads or active forms are clear.'
              : 'Refresh when you are ready, or it will apply on your next navigation.'}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setUpdateAvailable(false)
              setDeferredUntilNavigation(true)
              setDeferredForBusyState(false)
            }}
          >
            Later
          </Button>
          <Button type="button" size="sm" onClick={() => { void activateWaitingWorker() }}>
            Update now
          </Button>
        </div>
      </div>
    </div>
  )
}
