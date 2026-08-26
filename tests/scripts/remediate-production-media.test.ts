import { describe, expect, it } from 'vitest'

import {
  parseMissingDrafts,
  parseMissingImages,
  parseOrphans,
  parseSourceReplacements,
} from '@/scripts/media/remediate-production-media'

const imageId = '11111111-1111-4111-8111-111111111111'
const draftId = '22222222-2222-4222-8222-222222222222'
const missingKey = `images/originals/${imageId}/original.jpg`

function artifact() {
  return {
    schemaVersion: 1,
    readOnly: true,
    findings: [
      {
        category: 'missing_source',
        snapshot: {
          imageId,
          imageStatus: 'approved',
          processingStatus: 'ready',
          sourceKeys: [missingKey],
          sourceBytes: 0,
          canonicalKey: null,
        },
      },
      {
        category: 'missing_database_object',
        snapshot: {
          key: 'images/originals/33333333-3333-4333-8333-333333333333/original.png',
          surfaces: [{ surface: 'submission_draft_images.storage', recordId: draftId, imageId: null }],
        },
      },
      {
        category: 'source_replacement_awaiting_verification',
        snapshot: {
          kind: 'deletion_job', id: '55555555-5555-4555-8555-555555555555',
          imageId, bucket: 'lb-prod-media-private', objectKey: missingKey,
          reason: 'source_replaced', status: 'queued', deliveryVerifiedAt: null,
        },
      },
      {
        category: 'possible_r2_orphan',
        snapshot: {
          key: 'images/originals/44444444-4444-4444-8444-444444444444/original.jpg',
          size: 123,
          lastModified: '2026-08-01T00:00:00.000Z',
          etag: '"abc123"',
          surfaces: [],
          historicalSurfaces: [],
          namespaceImageExists: false,
        },
      },
    ],
  }
}

describe('production media remediation artifact parsing', () => {
  it('deduplicates missing-object reporting into image and draft records', () => {
    expect(parseMissingImages(artifact())).toEqual([{ kind: 'image', id: imageId, objectKey: missingKey }])
    expect(parseMissingDrafts(artifact())).toEqual([{
      kind: 'draft_image', id: draftId,
      objectKey: 'images/originals/33333333-3333-4333-8333-333333333333/original.png',
    }])
  })

  it('accepts only quarantine-grade orphan evidence', () => {
    expect(parseOrphans(artifact())).toEqual([{
      key: 'images/originals/44444444-4444-4444-8444-444444444444/original.jpg',
      size: 123, lastModified: '2026-08-01T00:00:00.000Z', etag: 'abc123',
    }])
    const unsafe = artifact()
    ;(unsafe.findings[3].snapshot as Record<string, unknown>).surfaces = [{ surface: 'images.original' }]
    expect(() => parseOrphans(unsafe)).toThrow(/not eligible/)
  })

  it('requires an exact queued and unverified source-replacement snapshot', () => {
    expect(parseSourceReplacements(artifact())).toEqual([{
      jobId: '55555555-5555-4555-8555-555555555555', imageId, objectKey: missingKey,
    }])
    const unsafe = artifact()
    ;(unsafe.findings[2].snapshot as Record<string, unknown>).deliveryVerifiedAt = '2026-08-01T00:00:00Z'
    expect(() => parseSourceReplacements(unsafe)).toThrow(/Invalid source-replacement/)
  })

  it('rejects a missing image that gained a canonical locator', () => {
    const unsafe = artifact()
    ;(unsafe.findings[0].snapshot as Record<string, unknown>).canonicalKey = 'images/assets/canonical.webp'
    expect(() => parseMissingImages(unsafe)).toThrow(/uncanonicalized/)
  })
})
