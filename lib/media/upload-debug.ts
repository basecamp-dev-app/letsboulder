function isUploadDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS === '1'
}

export function uploadDebug(event: string, details?: Record<string, unknown>) {
  if (!isUploadDebugEnabled()) return

  console.debug(`[upload-debug] ${event}`, details || {})
}
