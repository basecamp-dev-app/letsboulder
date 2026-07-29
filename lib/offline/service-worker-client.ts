const CHUNK_RELOAD_STORAGE_KEY = 'lb:chunk-reload-at'
const CHUNK_RELOAD_TTL_MS = 60_000

export const SERVICE_WORKER_URL = '/sw.js'

export function getServiceWorkerDisabledReason() {
  if (typeof window === 'undefined') return 'Service worker is not available during server render'
  if (!('serviceWorker' in navigator)) return 'Service worker is not supported in this browser'
  if (!window.isSecureContext) return 'Service worker requires a secure context'
  return null
}

export function shouldEnableServiceWorker() {
  return getServiceWorkerDisabledReason() === null
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
