import { describe, expect, test } from 'vitest'
import {
  parseCoordinate,
  formatCoordinate,
  parseOptionalCoordinate,
  isImageMetadataDirty,
  isCragMetadataDirty,
} from '@/features/editor/location/location-metadata'
import { resolveEffectiveDraftPublishLocation } from '@/features/draft-editor/lib/edit-draft-types'

describe('parseCoordinate', () => {
  test('returns null for empty string', () => {
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
  })

  test('returns number for valid coordinate', () => {
    expect(parseCoordinate('40.7128')).toBe(40.7128)
    expect(parseCoordinate('-74.006')).toBe(-74.006)
    expect(parseCoordinate('0')).toBe(0)
  })

  test('returns NaN for invalid input', () => {
    expect(parseCoordinate('abc')).toBeNaN()
    expect(parseCoordinate('12.34.56')).toBeNaN()
  })
})

describe('formatCoordinate', () => {
  test('formats to 6 decimal places', () => {
    expect(formatCoordinate(40.7128)).toBe('40.712800')
    expect(formatCoordinate(-74.006)).toBe('-74.006000')
    expect(formatCoordinate(0)).toBe('0.000000')
  })
})

describe('parseOptionalCoordinate', () => {
  test('returns null for empty string', () => {
    expect(parseOptionalCoordinate('')).toBeNull()
    expect(parseOptionalCoordinate('   ')).toBeNull()
  })

  test('returns number for valid input', () => {
    expect(parseOptionalCoordinate('40.7128')).toBe(40.7128)
  })

  test('returns NaN for invalid input', () => {
    expect(parseOptionalCoordinate('abc')).toBeNaN()
  })
})

describe('isImageMetadataDirty', () => {
  const baseInput = {
    initialLatitude: '40.7128',
    initialLongitude: '-74.006',
    latitude: '40.7128',
    longitude: '-74.006',
    initialFaceDirections: ['N', 'NE'] as never[],
    faceDirections: ['N', 'NE'] as never[],
    initialLocationMode: 'shared' as const,
    locationMode: 'shared' as const,
  }

  test('returns false when no changes', () => {
    expect(isImageMetadataDirty(baseInput)).toBe(false)
  })

  test('detects latitude change', () => {
    const input = { ...baseInput, latitude: '41.0' as const }
    expect(isImageMetadataDirty(input)).toBe(true)
  })

  test('detects longitude change', () => {
    const input = { ...baseInput, longitude: '-75.0' as const }
    expect(isImageMetadataDirty(input)).toBe(true)
  })

  test('detects face directions change', () => {
    const input = { ...baseInput, faceDirections: ['N', 'E'] as never[] }
    expect(isImageMetadataDirty(input)).toBe(true)
  })

  test('detects location mode change', () => {
    const input = { ...baseInput, locationMode: 'custom' as const }
    expect(isImageMetadataDirty(input)).toBe(true)
  })

  test('handles null initial values', () => {
    const input = {
      ...baseInput,
      initialLatitude: '',
      latitude: '40.7128',
    }
    expect(isImageMetadataDirty(input)).toBe(true)
  })
})

describe('isCragMetadataDirty', () => {
  const baseInput = {
    canEditCragMetadata: true,
    cragName: 'Yosemite',
    initialCragName: 'Yosemite',
    regionTag: 'CA',
    initialRegionTag: 'CA',
    subArea: 'Valley',
    initialSubArea: 'Valley',
  }

  test('returns false when no changes', () => {
    expect(isCragMetadataDirty(baseInput)).toBe(false)
  })

  test('returns false when canEditCragMetadata is false', () => {
    const input = { ...baseInput, canEditCragMetadata: false }
    expect(isCragMetadataDirty(input)).toBe(false)
  })

  test('detects crag name change', () => {
    const input = { ...baseInput, cragName: 'New Crag' }
    expect(isCragMetadataDirty(input)).toBe(true)
  })

  test('detects region tag change', () => {
    const input = { ...baseInput, regionTag: 'NV' }
    expect(isCragMetadataDirty(input)).toBe(true)
  })

  test('detects subArea change', () => {
    const input = { ...baseInput, subArea: 'Different Area' }
    expect(isCragMetadataDirty(input)).toBe(true)
  })

  test('handles whitespace trimming', () => {
    const input = { ...baseInput, cragName: '  Yosemite  ' }
    expect(isCragMetadataDirty(input)).toBe(false)
  })
})

describe('resolveEffectiveDraftPublishLocation', () => {
  test('prefers an explicit marker position', () => {
    expect(resolveEffectiveDraftPublishLocation([49.45, -2.55], [
      { latitude: 48.1, longitude: 11.5 },
    ])).toEqual([49.45, -2.55])
  })

  test('falls back to the first valid image gps position', () => {
    expect(resolveEffectiveDraftPublishLocation(null, [
      { latitude: null, longitude: null },
      { latitude: 49.46, longitude: -2.54 },
      { latitude: 49.47, longitude: -2.53 },
    ])).toEqual([49.46, -2.54])
  })

  test('returns null when neither marker nor images provide a valid location', () => {
    expect(resolveEffectiveDraftPublishLocation(null, [
      { latitude: null, longitude: null },
      { latitude: 0, longitude: 0 },
    ])).toBeNull()
  })
})
