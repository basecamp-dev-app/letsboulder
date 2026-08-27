export type MapFailureKind = 'webgl-unavailable' | 'initialization' | 'resource'

export interface MapFailure {
  error: Error
  kind: MapFailureKind
  severity: 'fatal' | 'degraded'
}

function normalizeMapError(error: unknown): Error {
  if (error instanceof Error) return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message)
  }
  return new Error(String(error))
}

export function classifyMapFailure(
  error: unknown,
  options: { resource?: boolean; fatal?: boolean } = {},
): MapFailure {
  const normalizedError = normalizeMapError(error)
  const message = normalizedError.message.toLowerCase()
  const webglUnavailable = message.includes('webgl')
    || message.includes('web gl')
    || message.includes('gl context')
    || message.includes('canvas context')

  return {
    error: normalizedError,
    kind: webglUnavailable ? 'webgl-unavailable' : options.resource ? 'resource' : 'initialization',
    severity: options.fatal === false ? 'degraded' : 'fatal',
  }
}
