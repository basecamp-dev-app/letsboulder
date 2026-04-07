import { describe, expect, test } from 'vitest'
import { calculateVoteCounts } from '@/features/admin/lib/vote-utils'

describe('Moderation Vote Logic', () => {
  describe('calculateVoteCounts', () => {
    test('verify vote increments verify_count', () => {
      const result = calculateVoteCounts({ verify_count: 0, flag_count: 0 }, 'verify')
      expect(result.newVerifyCount).toBe(1)
      expect(result.newFlagCount).toBe(0)
      expect(result.wasResolved).toBe(false)
      expect(result.resolutionStatus).toBeNull()
    })

    test('flag vote increments flag_count', () => {
      const result = calculateVoteCounts({ verify_count: 0, flag_count: 0 }, 'flag')
      expect(result.newVerifyCount).toBe(0)
      expect(result.newFlagCount).toBe(1)
      expect(result.wasResolved).toBe(false)
      expect(result.resolutionStatus).toBeNull()
    })

    test('threshold reached with verify at 3', () => {
      const result = calculateVoteCounts({ verify_count: 2, flag_count: 0 }, 'verify')
      expect(result.newVerifyCount).toBe(3)
      expect(result.wasResolved).toBe(true)
      expect(result.resolutionStatus).toBe('verified')
    })

    test('threshold reached with flag at 3', () => {
      const result = calculateVoteCounts({ verify_count: 0, flag_count: 2 }, 'flag')
      expect(result.newFlagCount).toBe(3)
      expect(result.wasResolved).toBe(true)
      expect(result.resolutionStatus).toBe('flagged')
    })

    test('verify takes precedence over flag when both at threshold', () => {
      const result = calculateVoteCounts({ verify_count: 2, flag_count: 2 }, 'verify')
      expect(result.newVerifyCount).toBe(3)
      expect(result.newFlagCount).toBe(2)
      expect(result.wasResolved).toBe(true)
      expect(result.resolutionStatus).toBe('verified')
    })

    test('threshold reached on first vote is false', () => {
      const result = calculateVoteCounts({ verify_count: 0, flag_count: 0 }, 'verify')
      expect(result.wasResolved).toBe(false)
    })

    test('2 verify votes does not resolve', () => {
      const result = calculateVoteCounts({ verify_count: 1, flag_count: 0 }, 'verify')
      expect(result.wasResolved).toBe(false)
      expect(result.resolutionStatus).toBeNull()
    })

    test('2 flag votes does not resolve', () => {
      const result = calculateVoteCounts({ verify_count: 0, flag_count: 1 }, 'flag')
      expect(result.wasResolved).toBe(false)
      expect(result.resolutionStatus).toBeNull()
    })
  })
})
