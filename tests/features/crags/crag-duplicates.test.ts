import { describe, expect, test } from 'vitest'
import { findCragDuplicateCandidate, normalizeCragDuplicateName } from '@/features/crags/lib/crag-duplicates'

describe('crag duplicate detection', () => {
  test('normalizes spacing and punctuation differences', () => {
    expect(normalizeCragDuplicateName('Magic Wood')).toBe('magicwood')
    expect(normalizeCragDuplicateName('magic-wood')).toBe('magicwood')
    expect(normalizeCragDuplicateName('Magicwood')).toBe('magicwood')
  })

  test('matches same normalized name within duplicate radius', () => {
    const match = findCragDuplicateCandidate({
      name: 'Magicwood',
      latitude: 46.56556,
      longitude: 9.436608,
      candidates: [{ id: 'keep', name: 'Magic Wood', latitude: 46.56336929, longitude: 9.43807785 }],
    })

    expect(match?.id).toBe('keep')
    expect(match?.distance).toBeGreaterThan(200)
    expect(match?.distance).toBeLessThan(400)
  })

  test('does not match different names nearby', () => {
    const match = findCragDuplicateCandidate({
      name: 'Magicwood',
      latitude: 46.56556,
      longitude: 9.436608,
      candidates: [{ id: 'other', name: 'Cresciano', latitude: 46.5655, longitude: 9.4366 }],
    })

    expect(match).toBeNull()
  })
})
