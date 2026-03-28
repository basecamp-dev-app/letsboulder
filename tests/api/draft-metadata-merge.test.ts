import { describe, expect, test } from 'vitest'

function mergeDraftMetadata(existingMetadata: Record<string, unknown>, metadataPatch: Record<string, unknown>) {
  return {
    ...existingMetadata,
    ...metadataPatch,
    submission: {
      ...((existingMetadata.submission && typeof existingMetadata.submission === 'object' && !Array.isArray(existingMetadata.submission))
        ? existingMetadata.submission as Record<string, unknown>
        : {}),
      ...((metadataPatch.submission && typeof metadataPatch.submission === 'object' && !Array.isArray(metadataPatch.submission))
        ? metadataPatch.submission as Record<string, unknown>
        : {}),
      location: {
        ...((((existingMetadata.submission && typeof existingMetadata.submission === 'object' && !Array.isArray(existingMetadata.submission)
          ? (existingMetadata.submission as Record<string, unknown>).location
          : null) && typeof (existingMetadata.submission as Record<string, unknown>).location === 'object' && !Array.isArray((existingMetadata.submission as Record<string, unknown>).location))
          ? (existingMetadata.submission as Record<string, unknown>).location as Record<string, unknown>
          : {})),
        ...((((metadataPatch.submission && typeof metadataPatch.submission === 'object' && !Array.isArray(metadataPatch.submission)
          ? (metadataPatch.submission as Record<string, unknown>).location
          : null) && typeof (metadataPatch.submission as Record<string, unknown>).location === 'object' && !Array.isArray((metadataPatch.submission as Record<string, unknown>).location))
          ? (metadataPatch.submission as Record<string, unknown>).location as Record<string, unknown>
          : {})),
      },
    },
  }
}

describe('draft metadata merge', () => {
  test('preserves submission routeType while patching location', () => {
    const merged = mergeDraftMetadata(
      {
        submission: {
          routeType: 'boulder',
          location: { latitude: 1, longitude: 2 },
        },
      },
      {
        submission: {
          location: { latitude: 3, longitude: 4 },
        },
      }
    )

    expect((merged.submission as Record<string, unknown>).routeType).toBe('boulder')
    expect(((merged.submission as Record<string, unknown>).location as Record<string, unknown>).latitude).toBe(3)
  })
})
