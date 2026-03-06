export function runWhenIdle(callback: () => void, timeout = 250) {
  if (typeof window === 'undefined') return () => undefined

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout })
    return () => window.cancelIdleCallback(id)
  }

  const id = globalThis.setTimeout(callback, timeout)
  return () => globalThis.clearTimeout(id)
}
