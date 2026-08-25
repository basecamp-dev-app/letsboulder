import { describe, expect, it } from 'vitest'

import { isActiveIngestStatus, shouldReportMissingSource } from '@/scripts/media/reconcile-r2-media'

describe('media reconciliation lifecycle classification', () => {
  it('requires objects only for active ingest jobs', () => {
    expect(isActiveIngestStatus('queued')).toBe(true)
    expect(isActiveIngestStatus('processing')).toBe(true)
    expect(isActiveIngestStatus('failed')).toBe(false)
    expect(isActiveIngestStatus('completed')).toBe(false)
  })

  it('reports a missing source only for a live image', () => {
    const missing = {
      live: true,
      sourceCount: 1,
      existingSourceCount: 0,
      originalDeleted: false,
      sourceDeletionTracked: false,
    }
    expect(shouldReportMissingSource(missing)).toBe(true)
    expect(shouldReportMissingSource({ ...missing, live: false })).toBe(false)
  })

  it('does not report intentionally deleted or deletion-tracked sources', () => {
    const missing = {
      live: true,
      sourceCount: 1,
      existingSourceCount: 0,
      originalDeleted: false,
      sourceDeletionTracked: false,
    }
    expect(shouldReportMissingSource({ ...missing, originalDeleted: true })).toBe(false)
    expect(shouldReportMissingSource({ ...missing, sourceDeletionTracked: true })).toBe(false)
    expect(shouldReportMissingSource({ ...missing, existingSourceCount: 1 })).toBe(false)
  })
})
