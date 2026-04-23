const DISABLED_SERVICE_WORKER_HOSTNAMES = new Set<string>()
const CHUNK_RELOAD_STORAGE_KEY = 'lb:chunk-reload-at'
const CHUNK_RELOAD_TTL_MS = 60_000

export const SERVICE_WORKER_URL = '/sw.js'

export function getServiceWorkerDisabledReason() {
  if (typeof window === 'undefined') return 'Service worker is not available during server render'
  if (!('serviceWorker' in navigator)) return 'Service worker is not supported in this browser'
  if (!window.isSecureContext) return 'Service worker requires a secure context'
  if (DISABLED_SERVICE_WORKER_HOSTNAMES.has(window.location.hostname)) {
    return `Offline features are disabled on ${window.location.hostname}`
  }
  return null
}

export function shouldEnableServiceWorker() {
  return getServiceWorkerDisabledReason() === null
}

export async function clearRegisteredServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))

  if (!('caches' in window)) return

  const cacheKeys = await caches.keys()
  await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
}

export function shouldReloadForChunkError(value: unknown) {
  if (!(value instanceof Error)) return false

  return value.name === 'ChunkLoadError'
    || value.message.includes('Loading chunk')
    || value.message.includes('Failed to fetch dynamically imported module')
}

export function canRetryChunkReload() {
  if (typeof window === 'undefined') return false

  const lastAttemptRaw = window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)
  const lastAttempt = lastAttemptRaw ? Number(lastAttemptRaw) : 0
  return !lastAttempt || Number.isNaN(lastAttempt) || Date.now() - lastAttempt > CHUNK_RELOAD_TTL_MS
}

export function markChunkReloadAttempt() {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(Date.now()))
}
