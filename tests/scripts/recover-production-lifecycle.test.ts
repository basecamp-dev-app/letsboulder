import { describe, expect, it } from 'vitest'

import { validateRecoveredRows, validateRecoveryInput } from '@/scripts/media/recover-production-lifecycle'

const id = '5a60f240-df39-4d64-8689-6176539f09a4'

function artifact(reason: string | null = null): unknown {
  return {
    schemaVersion: 1,
    readOnly: true,
    summary: { status: 'critical' },
    findings: [{
      severity: 'critical',
      snapshot: {
        kind: 'deletion_job', id, status: 'failed', updatedAt: '2026-08-01 12:00:00+00',
        runAt: '2026-08-01 12:00:00+00', lockedAt: null, lockedBy: null,
        attempts: 8, maxAttempts: 8, imageId: id, reason,
        bucket: 'lb-prod-media-private', objectKey: `images/originals/${id}/original.jpg`,
        deliveryVerifiedAt: null,
      },
    }],
  }
}

describe('validateRecoveryInput', () => {
  it('selects an explicit critical snapshot', () => {
    expect(validateRecoveryInput(artifact('source_replaced'), 'deletion_job', id))
      .toEqual([expect.objectContaining({ id, reason: 'source_replaced' })])
  })

  it('rejects duplicates, unknown IDs, and oversized selections', () => {
    expect(() => validateRecoveryInput(artifact(), 'deletion_job', `${id},${id}`)).toThrow(/duplicates/)
    expect(() => validateRecoveryInput(artifact(), 'deletion_job', '11111111-1111-4111-8111-111111111111'))
      .toThrow(/Every ID/)
    expect(() => validateRecoveryInput(artifact(), 'deletion_job', Array.from({ length: 26 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`).join(','))).toThrow(/1 to 25/)
  })

  it('rejects generic recovery of reconciled orphans', () => {
    expect(() => validateRecoveryInput(artifact('reconciled_orphan'), 'deletion_job', id))
      .toThrow(/rejects reconciled_orphan/)
  })

  it('requires exact critical artifact snapshots', () => {
    const input = artifact() as { findings: Array<{ severity: string; snapshot: Record<string, unknown> }> }
    input.findings[0].severity = 'warning'
    expect(() => validateRecoveryInput(input, 'deletion_job', id)).toThrow(/critical exact snapshot/)
    input.findings[0].severity = 'critical'
    delete input.findings[0].snapshot.updatedAt
    expect(() => validateRecoveryInput(input, 'deletion_job', id)).toThrow(/critical exact snapshot/)
  })

  it('rejects snapshots with fields not emitted by lifecycle health', () => {
    const input = artifact() as { findings: Array<{ snapshot: Record<string, unknown> }> }
    input.findings[0].snapshot.operatorNote = 'not reviewed'
    expect(() => validateRecoveryInput(input, 'deletion_job', id)).toThrow(/critical exact snapshot/)
  })
})

describe('validateRecoveredRows', () => {
  it('returns fresh replay IDs after matching their original job IDs', () => {
    const snapshots = validateRecoveryInput(artifact('source_replaced'), 'deletion_job', id)
    expect(validateRecoveredRows([{
      id: '11111111-1111-4111-8111-111111111111',
      replay_of_job_id: id,
    }], snapshots)).toEqual(['11111111-1111-4111-8111-111111111111'])
  })

  it('rejects missing or unexpected replay provenance', () => {
    const snapshots = validateRecoveryInput(artifact('source_replaced'), 'deletion_job', id)
    expect(() => validateRecoveredRows([{
      id: '11111111-1111-4111-8111-111111111111',
      replay_of_job_id: null,
    }], snapshots)).toThrow(/inconsistent/)
  })
})
