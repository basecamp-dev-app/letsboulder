import { describe, expect, it } from 'vitest'

import { classifyOrphanCandidates } from '@/scripts/media/enqueue-reconciled-orphans'

const imageId = '5a60f240-df39-4d64-8689-6176539f09a4'

function artifact(candidateOverrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 2,
    objectClassifications: {
      possibleOrphan: [{
        key: `images/originals/${imageId}/original.jpg`,
        size: 123,
        lastModified: '2026-08-01T12:00:00.000Z',
        etag: '"abc123"',
        surfaces: [],
        historicalSurfaces: [],
        namespaceImageId: imageId,
        namespaceImageExists: false,
        ...candidateOverrides,
      }],
    },
  }
}

describe('classifyOrphanCandidates', () => {
  it('accepts only the exact originals UUID namespace and normalizes metadata', () => {
    expect(classifyOrphanCandidates(artifact())).toMatchObject({
      sourceCount: 1,
      sourceBytes: 123,
      retained: [],
      candidates: [{
        key: `images/originals/${imageId}/original.jpg`,
        size: 123,
        etag: 'abc123',
        namespaceImageId: imageId,
      }],
    })
  })

  it.each([
    ['wrong namespace', { key: `images/assets/${imageId}/original.jpg` }],
    ['nested original', { key: `images/originals/${imageId}/nested/original.jpg` }],
    ['current surface', { surfaces: [{ surface: 'images.original' }] }],
    ['historical surface', { historicalSurfaces: ['images.url'] }],
    ['existing namespace image', { namespaceImageExists: true }],
  ])('quarantines a noneligible candidate with %s', (_label, overrides) => {
    const result = classifyOrphanCandidates(artifact(overrides))
    expect(result.candidates).toEqual([])
    expect(result.retained).toEqual([expect.objectContaining({ reason: 'noneligible-artifact-candidate' })])
  })

  it('rejects reconciliation schemas other than v2', () => {
    expect(() => classifyOrphanCandidates({ schemaVersion: 1 })).toThrow(/schemaVersion 2/)
  })

  it('sorts eligible keys deterministically and rejects duplicates', () => {
    const first = artifact() as { objectClassifications: { possibleOrphan: Array<Record<string, unknown>> } }
    const secondId = '11111111-1111-4111-8111-111111111111'
    first.objectClassifications.possibleOrphan.unshift({
      ...first.objectClassifications.possibleOrphan[0],
      key: `images/originals/${secondId}/original.jpg`,
      namespaceImageId: secondId,
    })
    expect(classifyOrphanCandidates(first).candidates.map((candidate) => candidate.namespaceImageId))
      .toEqual([secondId, imageId])
    first.objectClassifications.possibleOrphan.push(first.objectClassifications.possibleOrphan[0])
    expect(() => classifyOrphanCandidates(first)).toThrow(/duplicate object key/)
  })
})
