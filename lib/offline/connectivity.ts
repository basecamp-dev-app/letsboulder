export type ConnectivityMode = 'healthy' | 'degraded' | 'offline'

export type ConnectivityReason = 'online' | 'weak-signal' | 'unstable' | 'offline'

export interface ConnectivityState {
  mode: ConnectivityMode
  reason: ConnectivityReason
}

export const CONNECTIVITY_PROBE_URL = '/api/connectivity'
export const CONNECTIVITY_RESPONSE_HEADER = 'x-letsboulder-connectivity'

export async function probeConnectivity(
  fetcher: typeof fetch = fetch,
  timeoutMs = 2_500,
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(CONNECTIVITY_PROBE_URL, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    return response.ok && response.headers.get(CONNECTIVITY_RESPONSE_HEADER) === 'online'
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function resolveConnectivityState(args: {
  isOnline: boolean
  hasRecentNetworkFailure?: boolean
}): ConnectivityState {
  if (!args.isOnline) {
    return {
      mode: 'offline',
      reason: 'offline',
    }
  }

  if (args.hasRecentNetworkFailure) {
    return {
      mode: 'degraded',
      reason: 'unstable',
    }
  }

  return {
    mode: 'healthy',
    reason: 'online',
  }
}
