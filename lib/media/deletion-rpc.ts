import type { DraftStorageCleanupRow } from '@/lib/media/draft-storage'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getRpcErrorDetail(error: { details?: string } | null): string | null {
  return error?.details?.trim() || null
}

export function getRpcErrorHint(error: { hint?: string } | null): string | null {
  return error?.hint?.trim() || null
}

export function parseStorageCleanupRows(value: unknown): DraftStorageCleanupRow[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((row) => {
    if (!isRecord(row)
      || typeof row.storage_provider !== 'string'
      || typeof row.storage_bucket !== 'string'
      || typeof row.storage_path !== 'string') {
      return []
    }

    return [{
      storage_provider: row.storage_provider,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
    }]
  })
}
