import { describe, expect, test } from 'vitest'

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function isValidStatus(status: unknown): status is 'going' | 'interested' {
  return status === 'going' || status === 'interested'
}

describe('Community Actions Utilities', () => {
  describe('parseDate', () => {
    test('returns null for null/undefined/empty', () => {
      expect(parseDate(null)).toBeNull()
      expect(parseDate(undefined)).toBeNull()
      expect(parseDate('')).toBeNull()
    })

    test('parses valid ISO date string', () => {
      const result = parseDate('2024-01-15T10:30:00Z')
      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })

    test('parses valid date string', () => {
      const result = parseDate('2024-01-15')
      expect(result).toBe('2024-01-15T00:00:00.000Z')
    })

    test('returns null for invalid date', () => {
      expect(parseDate('invalid')).toBeNull()
      expect(parseDate('not-a-date')).toBeNull()
    })
  })

  describe('isValidStatus', () => {
    test('returns true for valid statuses', () => {
      expect(isValidStatus('going')).toBe(true)
      expect(isValidStatus('interested')).toBe(true)
    })

    test('returns false for invalid statuses', () => {
      expect(isValidStatus(null)).toBe(false)
      expect(isValidStatus(undefined)).toBe(false)
      expect(isValidStatus('')).toBe(false)
      expect(isValidStatus('invalid')).toBe(false)
      expect(isValidStatus('maybe')).toBe(false)
    })
  })

  describe('Post type validation', () => {
    const ALLOWED_POST_TYPES = new Set(['session', 'update', 'conditions', 'question'])

    test('accepts valid post types', () => {
      expect(ALLOWED_POST_TYPES.has('session')).toBe(true)
      expect(ALLOWED_POST_TYPES.has('update')).toBe(true)
      expect(ALLOWED_POST_TYPES.has('conditions')).toBe(true)
      expect(ALLOWED_POST_TYPES.has('question')).toBe(true)
    })

    test('rejects invalid post types', () => {
      expect(ALLOWED_POST_TYPES.has('invalid')).toBe(false)
      expect(ALLOWED_POST_TYPES.has('')).toBe(false)
    })
  })

  describe('Discipline validation', () => {
    const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])

    test('accepts valid disciplines', () => {
      expect(ALLOWED_DISCIPLINES.has('boulder')).toBe(true)
      expect(ALLOWED_DISCIPLINES.has('sport')).toBe(true)
      expect(ALLOWED_DISCIPLINES.has('trad')).toBe(true)
    })

    test('rejects invalid disciplines', () => {
      expect(ALLOWED_DISCIPLINES.has('invalid')).toBe(false)
      expect(ALLOWED_DISCIPLINES.has('')).toBe(false)
    })
  })

  describe('RSVP count calculation', () => {
    function calculateRsvpCounts(
      rsvps: Array<{ user_id: string; status: 'going' | 'interested' }>,
      viewerId: string
    ) {
      let goingCount = 0
      let interestedCount = 0
      let viewerRsvp: 'going' | 'interested' | null = null

      for (const rsvp of rsvps) {
        if (rsvp.status === 'going') goingCount += 1
        if (rsvp.status === 'interested') interestedCount += 1
        if (rsvp.user_id === viewerId) viewerRsvp = rsvp.status
      }

      return {
        rsvp_counts: { going: goingCount, interested: interestedCount },
        viewer_rsvp: viewerRsvp,
      }
    }

    test('calculates correct counts', () => {
      const rsvps = [
        { user_id: 'user-1', status: 'going' as const },
        { user_id: 'user-2', status: 'going' as const },
        { user_id: 'user-3', status: 'interested' as const },
      ]

      const result = calculateRsvpCounts(rsvps, 'user-1')
      expect(result.rsvp_counts).toEqual({ going: 2, interested: 1 })
      expect(result.viewer_rsvp).toBe('going')
    })

    test('returns null viewer_rsvp when not attending', () => {
      const rsvps = [
        { user_id: 'user-1', status: 'going' as const },
      ]

      const result = calculateRsvpCounts(rsvps, 'other-user')
      expect(result.viewer_rsvp).toBeNull()
    })
  })

  describe('Date validation for session posts', () => {
    function isEndAtValid(startAt: string, endAt: string): boolean {
      return new Date(endAt).getTime() > new Date(startAt).getTime()
    }

    test('end_at after start_at is valid', () => {
      expect(isEndAtValid('2024-01-15T10:00:00Z', '2024-01-15T12:00:00Z')).toBe(true)
    })

    test('end_at before start_at is invalid', () => {
      expect(isEndAtValid('2024-01-15T12:00:00Z', '2024-01-15T10:00:00Z')).toBe(false)
    })

    test('same time is invalid', () => {
      expect(isEndAtValid('2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')).toBe(false)
    })
  })
})
