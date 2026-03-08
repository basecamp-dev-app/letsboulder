interface ServiceWorkerMessage<TPayload> {
  type: string
  payload: TPayload
}

interface ServiceWorkerResponse {
  ok: boolean
  error?: string
  warning?: string
  failedTileUrls?: string[]
}

export interface OfflineJobProgressEvent {
  type: 'OFFLINE_JOB_PROGRESS'
  jobId: string
  phase: 'fetch-manifests' | 'cache-pages' | 'cache-media' | 'cleanup' | 'done' | 'error'
  completedClimbs: number
  totalClimbs: number
  completedBytes: number
  totalBytes: number
  currentClimbId?: string
  currentClimbName?: string
  error?: string
}

const OFFLINE_JOB_CHANNEL = 'offline-pack-jobs'
const SERVICE_WORKER_URL = '/sw.js'

async function waitForServiceWorkerActivation(registration: ServiceWorkerRegistration) {
  const candidate = registration.installing || registration.waiting
  if (!candidate) return

  await new Promise<void>((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      candidate.removeEventListener('statechange', handleStateChange)
      window.clearTimeout(timeoutId)
      resolve()
    }

    const handleControllerChange = () => finish()
    const handleStateChange = () => {
      if (candidate.state === 'activated' || candidate.state === 'redundant') {
        finish()
      }
    }

    const timeoutId = window.setTimeout(finish, 5000)

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    candidate.addEventListener('statechange', handleStateChange)

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  })
}

async function ensureServiceWorkerIsCurrent() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker is not supported')
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
  await registration.update().catch(() => undefined)
  await waitForServiceWorkerActivation(registration)
  await navigator.serviceWorker.ready
}

async function waitForController() {
  await ensureServiceWorkerIsCurrent()

  const registration = await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller
  }

  if (registration.active) {
    return registration.active
  }

  throw new Error('Service worker is not active')
}

export async function sendServiceWorkerMessage<TPayload>(message: ServiceWorkerMessage<TPayload>) {
  const controller = await waitForController()

  return new Promise<ServiceWorkerResponse>((resolve, reject) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => {
      resolve((event.data || { ok: false, error: 'Unknown service worker response' }) as ServiceWorkerResponse)
    }

    try {
      controller.postMessage(message, [channel.port2])
    } catch (error) {
      reject(error)
    }
  })
}

export function subscribeToOfflineJobProgress(jobId: string, callback: (event: OfflineJobProgressEvent) => void) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {}
  }

  const channel = new BroadcastChannel(OFFLINE_JOB_CHANNEL)
  channel.onmessage = (event: MessageEvent<OfflineJobProgressEvent>) => {
    if (!event.data || event.data.jobId !== jobId) return
    callback(event.data)
  }

  return () => {
    channel.close()
  }
}
