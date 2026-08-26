import { describe, expect, it } from 'vitest'

import {
  assertSecretFree,
  buildRecoverySelections,
  type RecoverySelection,
} from '@/scripts/media/automate-production-media-lifecycle'

const imageId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'

function health(findings: unknown[]): unknown {
  return {
    schemaVersion: 1,
    readOnly: true,
    generatedAt: '2026-08-26T10:00:00.000Z',
    summary: { critical: findings.length, warning: 0, info: 0, status: 'critical' },
    findings,
  }
}

function missingSource(
  key = `images/originals/${imageId}/original.jpg`,
  candidateImageId = imageId,
): unknown {
  return {
    category: 'missing_source',
    snapshot: { imageId: candidateImageId, sourceKeys: [key], canonicalKey: null },
  }
}

function sourceReplacement(): unknown {
  return {
    category: 'source_replacement_awaiting_verification',
    snapshot: {
      id: jobId,
      imageId,
      kind: 'deletion_job',
      status: 'queued',
      reason: 'source_replaced',
      bucket: 'lb-prod-media-private',
      objectKey: `images/assets/${imageId}/source/original.jpg`,
      deliveryVerifiedAt: null,
    },
  }
}

function missingDraft(): unknown {
  return {
    category: 'missing_database_object',
    snapshot: {
      key: `images/staging/${draftId}/original.jpg`,
      surfaces: [{ surface: 'submission_draft_images.storage', recordId: draftId, imageId: null }],
    },
  }
}

function previous(selections: RecoverySelection[]): unknown {
  return { schemaVersion: 1, selections }
}

describe('buildRecoverySelections', () => {
  it('requires a second consistent observation after the configured delay', () => {
    const artifact = health([missingSource()])
    const first = buildRecoverySelections(artifact, null, '2026-08-26T10:00:00.000Z', 3_600, 25)
    expect(first).toEqual([expect.objectContaining({ observationCount: 1, eligible: false })])

    const tooEarly = buildRecoverySelections(
      artifact, previous(first), '2026-08-26T10:59:59.000Z', 3_600, 25,
    )
    expect(tooEarly[0]).toEqual(expect.objectContaining({ observationCount: 2, eligible: false }))

    const eligible = buildRecoverySelections(
      artifact, previous(first), '2026-08-26T11:00:00.000Z', 3_600, 25,
    )
    expect(eligible[0]).toEqual(expect.objectContaining({ observationCount: 2, eligible: true }))
  })

  it('resets eligibility when the exact candidate fingerprint changes', () => {
    const original = buildRecoverySelections(
      health([missingSource()]), null, '2026-08-26T10:00:00.000Z', 3_600, 25,
    )
    const changed = buildRecoverySelections(
      health([missingSource(`images/originals/${imageId}/changed.jpg`)]),
      previous(original), '2026-08-26T12:00:00.000Z', 3_600, 25,
    )
    expect(changed[0]).toEqual(expect.objectContaining({
      observationCount: 1,
      firstObservedAt: '2026-08-26T12:00:00.000Z',
      eligible: false,
    }))
  })

  it('deduplicates overlapping findings for the same logical record', () => {
    const selections = buildRecoverySelections(
      health([missingSource(), missingSource(), missingDraft()]),
      null, '2026-08-26T10:00:00.000Z', 3_600, 25,
    )
    expect(selections.filter((item) => item.kind === 'missing_reference')).toHaveLength(2)
  })

  it('validates source replacements on their first observation', () => {
    const selections = buildRecoverySelections(
      health([sourceReplacement()]), null, '2026-08-26T10:00:00.000Z', 3_600, 25,
    )
    expect(selections[0]).toEqual(expect.objectContaining({
      kind: 'source_replacement', observationCount: 1, eligible: true,
    }))
  })

  it('caps each deterministic candidate category at 25', () => {
    const findings = Array.from({ length: 26 }, (_, index) => {
      const candidateImageId = `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
      return missingSource(`images/originals/${candidateImageId}/original.jpg`, candidateImageId)
    })
    const selections = buildRecoverySelections(
      health(findings), null, '2026-08-26T10:00:00.000Z', 3_600, 25,
    )
    expect(selections).toHaveLength(25)
  })
})

describe('assertSecretFree', () => {
  it('accepts deterministic operational fields', () => {
    expect(() => assertSecretFree({ schemaVersion: 1, objectKey: 'images/originals/id/file.jpg' })).not.toThrow()
  })

  it('rejects secret fields and raw connection strings', () => {
    expect(() => assertSecretFree({ serviceRoleKey: 'value' })).toThrow(/forbidden field/)
    expect(() => assertSecretFree({ error: 'postgresql://user:pass@example.test/db' })).toThrow(/secret-like data/)
  })
})
