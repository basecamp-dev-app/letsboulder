function isUploadDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS === '1'
}

function sanitizeUrl(input: string): string {
  return input
    .replace(/([?&])X-Amz-Signature=[^&]*/g, '$1X-Amz-Signature=[REDACTED]')
    .replace(/([?&])X-Amz-Algorithm=[^&]*/g, '$1X-Amz-Algorithm=[REDACTED]')
    .replace(/([?&])X-Amz-Credential=[^&]*/g, '$1X-Amz-Credential=[REDACTED]')
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' && (value.includes('X-Amz-Signature') || value.includes('X-Amz-Credential') || value.includes('X-Amz-Algorithm'))) {
      sanitized[key] = sanitizeUrl(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

function isOnRelevantRoute(): boolean {
  if (typeof window === 'undefined') return true
  const { pathname } = window.location
  return pathname.includes('/edit') || pathname.includes('/upload')
}

export function uploadDebug(event: string, details?: Record<string, unknown>) {
  if (!isUploadDebugEnabled()) return
  if (!isOnRelevantRoute()) return

  console.debug(`[upload-debug] ${event}`, details ? sanitizeDetails(details) : {})
}
