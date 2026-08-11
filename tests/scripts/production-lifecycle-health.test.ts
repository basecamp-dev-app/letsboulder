import { describe, expect, it } from 'vitest'

import { classifyLifecycleAge, jobFinding } from '@/scripts/media/production-lifecycle-health'

describe('classifyLifecycleAge', () => {
  it('classifies only ages after the warning and critical thresholds', () => {
    expect(classifyLifecycleAge(30 * 60)).toBe('info')
    expect(classifyLifecycleAge(30 * 60 + 1)).toBe('warning')
    expect(classifyLifecycleAge(6 * 60 * 60)).toBe('warning')
    expect(classifyLifecycleAge(6 * 60 * 60 + 1)).toBe('critical')
  })

  it('classifies terminal and invariant findings as immediately critical', () => {
    expect(classifyLifecycleAge(0, true)).toBe('critical')
  })

  it('rejects invalid ages', () => {
    expect(() => classifyLifecycleAge(-1)).toThrow(/non-negative/)
    expect(() => classifyLifecycleAge(Number.NaN)).toThrow(/non-negative/)
  })
})

describe('jobFinding', () => {
  it('keeps unresolved failures critical and reports proven resolutions as informational', () => {
    const row = {
      kind: 'ingest_job' as const,
      id: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      updated_at: '2026-08-11 10:00:00+00',
      created_at: '2026-08-11 09:00:00+00',
      run_at: '2026-08-11 09:00:00+00',
      locked_at: null,
      locked_by: null,
      attempts: 5,
      max_attempts: 5,
      image_id: '22222222-2222-4222-8222-222222222222',
      reason: null,
      bucket: null,
      object_key: null,
      delivery_verified_at: null,
      resolution: null,
    }
    const asOf = new Date('2026-08-11T11:00:00Z')

    expect(jobFinding(row, asOf)).toMatchObject({ category: 'ingest_failed', severity: 'critical' })
    expect(jobFinding({ ...row, resolution: 'completed_replay' }, asOf)).toMatchObject({
      category: 'ingest_failed_resolved',
      severity: 'info',
      detail: 'Resolved historical ingest failure: completed_replay',
    })
  })
})
