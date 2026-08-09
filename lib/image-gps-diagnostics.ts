import { csrfFetch } from '@/lib/csrf-client'

export interface ImageGpsDiagnosticStage {
  name: string
  durationMs: number
  outcome: 'success' | 'empty' | 'error'
  error?: { name: string; message: string }
}

export interface ImageGpsDiagnostic {
  fileName: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  userAgent: string
  arrayBuffer: { success: boolean; byteLength: number | null }
  stages: ImageGpsDiagnosticStage[]
  source: 'buffer' | 'Blob' | 'fallback' | 'none'
}

function isReportingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_IMAGE_GPS === 'true'
}

export function reportImageGpsDiagnostic(diagnostic: ImageGpsDiagnostic): void {
  if (!isReportingEnabled()) return

  void csrfFetch('/api/diagnostics/image-gps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(diagnostic),
  }).catch(() => undefined)
}
