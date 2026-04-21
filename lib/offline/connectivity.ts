export type ConnectivityMode = 'healthy' | 'degraded' | 'offline'

export type ConnectivityReason = 'online' | 'weak-signal' | 'unstable' | 'offline'

export interface ConnectivityState {
  mode: ConnectivityMode
  reason: ConnectivityReason
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
