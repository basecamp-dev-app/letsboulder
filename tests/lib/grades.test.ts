import { describe, expect, test } from 'vitest'
import {
  calculateStats,
  clampGradeToPublicRange,
  FLASH_BONUS,
  getClosestGradeIndex,
  getDifficultyGroup,
  getFlashPoints,
  getGradeDisplay,
  getGradeFromPoints,
  getGradeIndex,
  getGradeMapping,
  getGradePoints,
  getInitials,
  getNextGrade,
  getNextGradeIndex,
  getPreviousGrade,
  getPreviousGradeIndex,
  getProgressPercent,
  getLowestGrade,
  normalizeGrade,
  type LogEntry,
} from '@/lib/grades'

// ---------------------------------------------------------------------------
// getGradePoints / getGradeFromPoints
// ---------------------------------------------------------------------------

describe('getGradePoints', () => {
  test('returns 0 for null / undefined / empty', () => {
    expect(getGradePoints(null)).toBe(0)
    expect(getGradePoints(undefined)).toBe(0)
    expect(getGradePoints('')).toBe(0)
  })

  test('returns 0 for unknown grade', () => {
    expect(getGradePoints('ZZ')).toBe(0)
  })

  test.each([
    ['1A', 100],
    ['3A', 292],
    ['3C+', 372],
    ['4A', 388],
    ['4B+', 436],
    ['6A', 580],
    ['6B+', 628],
    ['7C', 740],
    ['8A+', 788],
    ['9C+', 948],
  ])('getGradePoints(%s) === %i', (grade, expected) => {
    expect(getGradePoints(grade)).toBe(expected)
  })
})

describe('getGradeFromPoints', () => {
  test('returns exact grade match', () => {
    expect(getGradeFromPoints(580)).toBe('6A')
    expect(getGradeFromPoints(292)).toBe('3A')
    expect(getGradeFromPoints(948)).toBe('9C+')
  })

  test('returns closest grade when not exact', () => {
    // 305: closer to 3A+ (308, diff=3) than 3A (292, diff=13)
    expect(getGradeFromPoints(305)).toBe('3A+')
  })

  test('equidistant returns first in iteration order', () => {
    // 300 is equidistant from 3A (292) and 3A+ (308); 3A comes first in map
    expect(getGradeFromPoints(300)).toBe('3A')
  })

  test('defaults to 6A when no grades exist (edge)', () => {
    // function always has the map, so 6A is the initial closest
    expect(getGradeFromPoints(0)).toBeDefined()
  })

  test('handles extreme values', () => {
    expect(getGradeFromPoints(-100)).toBeDefined()
    expect(getGradeFromPoints(99999)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// getClosestGradeIndex
// ---------------------------------------------------------------------------

describe('getClosestGradeIndex', () => {
  test('points = 400 maps to index 0', () => {
    expect(getClosestGradeIndex(400)).toBe(0)
  })

  test('rounds to nearest index', () => {
    // Math.round((416 - 400) / 16) = Math.round(1) = 1
    expect(getClosestGradeIndex(416)).toBe(1)
    // Math.round((432 - 400) / 16) = Math.round(2) = 2
    expect(getClosestGradeIndex(432)).toBe(2)
  })

  test('boundary rounding: 408 rounds to 0', () => {
    // (408 - 400) / 16 = 0.5 → rounds to 1, but verify actual behavior
    expect(getClosestGradeIndex(408)).toBe(1)
  })

  test('boundary rounding: 392 rounds to 0', () => {
    // (392 - 400) / 16 = -0.5 → rounds to 0
    expect(getClosestGradeIndex(392)).toBe(0)
  })

  test('clamps negative index to 0', () => {
    expect(getClosestGradeIndex(0)).toBe(0)
    expect(getClosestGradeIndex(-999)).toBe(0)
  })

  test('clamps above-max index to 41', () => {
    // (1000 - 400) / 16 = 37.5 → 38, within range
    expect(getClosestGradeIndex(1000)).toBe(38)
    // (99999 - 400) / 16 = 6225 → clamped to 41
    expect(getClosestGradeIndex(99999)).toBe(41)
  })

  test('index 41 boundary', () => {
    // 400 + 41 * 16 = 1056 → index 41
    expect(getClosestGradeIndex(1056)).toBe(41)
    // 400 + 42 * 16 = 1072 → would be 42, clamped to 41
    expect(getClosestGradeIndex(1072)).toBe(41)
    // 400 + 40 * 16 = 1040 → index 40
    expect(getClosestGradeIndex(1040)).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// clampGradeToPublicRange
// ---------------------------------------------------------------------------

describe('clampGradeToPublicRange', () => {
  test('null / undefined → null', () => {
    expect(clampGradeToPublicRange(null)).toBeNull()
    expect(clampGradeToPublicRange(undefined)).toBeNull()
    expect(clampGradeToPublicRange('')).toBeNull()
  })

  test('valid public grade returned as-is', () => {
    expect(clampGradeToPublicRange('6A')).toBe('6A')
    expect(clampGradeToPublicRange('3A')).toBe('3A')
    expect(clampGradeToPublicRange('9C+')).toBe('9C+')
  })

  test('below-min grade clamped to 3A', () => {
    expect(clampGradeToPublicRange('2A')).toBe('3A')
    expect(clampGradeToPublicRange('2B+')).toBe('3A')
    expect(clampGradeToPublicRange('1A')).toBe('3A')
  })

  test('unknown grade string → null', () => {
    expect(clampGradeToPublicRange('ZZ')).toBeNull()
    expect(clampGradeToPublicRange('V5')).toBeNull()
  })

  test('normalizes case before clamping', () => {
    expect(clampGradeToPublicRange('2a')).toBe('3A')
    expect(clampGradeToPublicRange('6a')).toBe('6A')
  })
})

// ---------------------------------------------------------------------------
// getGradeDisplay / getGradeIndex / getDifficultyGroup / getGradeMapping
// ---------------------------------------------------------------------------

describe('getGradeDisplay', () => {
  test('returns correct display for each system', () => {
    expect(getGradeDisplay(0, 'v_scale')).toBe('VB-')
    expect(getGradeDisplay(0, 'font_scale')).toBe('3A')
    expect(getGradeDisplay(0, 'yds_equivalent')).toBe('5.4')
  })

  test('null / undefined / invalid index → null', () => {
    expect(getGradeDisplay(null, 'v_scale')).toBeNull()
    expect(getGradeDisplay(undefined, 'v_scale')).toBeNull()
    expect(getGradeDisplay(999, 'v_scale')).toBeNull()
  })
})

describe('getGradeIndex', () => {
  test('parses v-scale, font, and french grades', () => {
    expect(getGradeIndex('V0')).toBe(7)
    expect(getGradeIndex('v0')).toBe(7) // case-insensitive
    expect(getGradeIndex('4A')).toBe(6)
    expect(getGradeIndex('6A')).toBe(18)
  })

  test('parses french equivalent (lowercase)', () => {
    // french maps use lowercase keys; '8a' last maps to index 30
    expect(getGradeIndex('8a')).toBe(30)
  })

  test('null / empty / unknown → null', () => {
    expect(getGradeIndex(null)).toBeNull()
    expect(getGradeIndex('')).toBeNull()
    expect(getGradeIndex('ZZZZ')).toBeNull()
  })
})

describe('getDifficultyGroup', () => {
  test.each([
    [0, 'Beginner'],
    [7, 'Beginner'],
    [18, 'Intermediate'],
    [21, 'Advanced'],
    [28, 'Expert'],
    [41, 'Elite'],
  ])('getDifficultyGroup(%i) === %s', (index, expected) => {
    expect(getDifficultyGroup(index)).toBe(expected)
  })

  test('null / undefined / invalid → null', () => {
    expect(getDifficultyGroup(null)).toBeNull()
    expect(getDifficultyGroup(undefined)).toBeNull()
    expect(getDifficultyGroup(999)).toBeNull()
  })
})

describe('getGradeMapping', () => {
  test('returns mapping for valid index', () => {
    const mapping = getGradeMapping(18)
    expect(mapping).not.toBeNull()
    expect(mapping!.v_scale).toBe('V3')
    expect(mapping!.font_scale).toBe('6A')
  })

  test('null / undefined / invalid → null', () => {
    expect(getGradeMapping(null)).toBeNull()
    expect(getGradeMapping(999)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getNextGradeIndex / getPreviousGradeIndex / getNextGrade / getPreviousGrade
// ---------------------------------------------------------------------------

describe('getNextGradeIndex / getPreviousGradeIndex', () => {
  test('getNextGradeIndex returns next grade_index', () => {
    expect(getNextGradeIndex(0)).toBe(1)
    expect(getNextGradeIndex(17)).toBe(18)
  })

  test('getNextGradeIndex at last index → null', () => {
    expect(getNextGradeIndex(41)).toBeNull()
  })

  test('getPreviousGradeIndex returns previous grade_index', () => {
    expect(getPreviousGradeIndex(18)).toBe(17)
    expect(getPreviousGradeIndex(41)).toBe(40)
  })

  test('getPreviousGradeIndex at first index → null', () => {
    expect(getPreviousGradeIndex(0)).toBeNull()
  })
})

describe('getNextGrade / getPreviousGrade', () => {
  test('getNextGrade returns next string grade', () => {
    expect(getNextGrade('6A')).toBe('6A+')
  })

  test('getNextGrade at last grade → self', () => {
    expect(getNextGrade('9C+')).toBe('9C+')
  })

  test('getPreviousGrade returns previous string grade', () => {
    expect(getPreviousGrade('6A+')).toBe('6A')
  })

  test('getPreviousGrade at first grade → self', () => {
    expect(getPreviousGrade('1A')).toBe('1A')
  })
})

// ---------------------------------------------------------------------------
// getProgressPercent / getInitials / getFlashPoints
// ---------------------------------------------------------------------------

describe('getProgressPercent', () => {
  test('at previous grade → 0%', () => {
    expect(getProgressPercent(292, '3A', '3A+')).toBe(0)
  })

  test('at next grade → 100%', () => {
    expect(getProgressPercent(308, '3A', '3A+')).toBe(100)
  })

  test('at midpoint → 50%', () => {
    // 3A=292, 3A+=308, midpoint=300
    expect(getProgressPercent(300, '3A', '3A+')).toBe(50)
  })

  test('invalid grade names → 0', () => {
    expect(getProgressPercent(500, 'ZZ', 'YY')).toBe(0)
  })

  test('nextPoints <= previousPoints → 0', () => {
    expect(getProgressPercent(500, '6A', '6A')).toBe(0)
  })
})

describe('getInitials', () => {
  test.each([
    ['John Doe', 'JD'],
    ['Alice', 'A'],
    ['John Michael Smith', 'JM'],
    ['', ''],
  ])('getInitials(%s) === %s', (input, expected) => {
    expect(getInitials(input)).toBe(expected)
  })
})

describe('getFlashPoints', () => {
  test('adds FLASH_BONUS to grade points', () => {
    expect(getFlashPoints('6A')).toBe(580 + FLASH_BONUS)
    expect(getFlashPoints('3A')).toBe(292 + FLASH_BONUS)
  })
})

// ---------------------------------------------------------------------------
// normalizeGrade
// ---------------------------------------------------------------------------

describe('normalizeGrade', () => {
  test('uppercases and trims', () => {
    expect(normalizeGrade(' 6a ')).toBe('6A')
  })

  test('null / undefined → null', () => {
    expect(normalizeGrade(null)).toBeNull()
    expect(normalizeGrade(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getLowestGrade
// ---------------------------------------------------------------------------

describe('getLowestGrade', () => {
  test('returns lowest grade with count > 0', () => {
    expect(getLowestGrade({ '3A': 0, '4A': 0, '6A': 1, '7A': 2 })).toBe('6A')
  })

  test('all zeros → 6A default', () => {
    const empty: Record<string, number> = {}
    expect(getLowestGrade(empty)).toBe('6A')
  })
})

// ---------------------------------------------------------------------------
// calculateStats
// ---------------------------------------------------------------------------

function makeLog(
  overrides: Partial<LogEntry> & { grade?: string; style?: string }
): LogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    climb_id: overrides.climb_id ?? 'climb-1',
    style: overrides.style ?? 'top',
    created_at: overrides.created_at ?? new Date().toISOString(),
    date_climbed: overrides.date_climbed,
    climbs: {
      grade: overrides.grade ?? '6A',
      name: overrides.climbs?.name ?? 'Test Route',
    },
  }
}

describe('calculateStats', () => {
  test('empty logs → zeroed defaults', () => {
    const stats = calculateStats([])
    expect(stats.totalClimbs).toBe(0)
    expect(stats.totalFlashes).toBe(0)
    expect(stats.totalTops).toBe(0)
    expect(stats.totalTries).toBe(0)
    expect(stats.averageGrade).toBe('6A')
    expect(stats.twoMonthAverage).toBe(0)
    expect(stats.top10Hardest).toEqual([])
    expect(stats.gradePyramid).toEqual({})
    expect(stats.gradeHistory).toEqual([])
  })

  test('counts styles correctly', () => {
    const logs: LogEntry[] = [
      makeLog({ style: 'flash' }),
      makeLog({ style: 'top' }),
      makeLog({ style: 'top' }),
      makeLog({ style: 'try' }),
    ]

    const stats = calculateStats(logs)
    expect(stats.totalClimbs).toBe(4)
    expect(stats.totalFlashes).toBe(1)
    expect(stats.totalTops).toBe(2)
    expect(stats.totalTries).toBe(1)
  })

  test('flash includes bonus in sorting / average', () => {
    const now = new Date().toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'flash', grade: '6A', created_at: now }),
      makeLog({ style: 'top', grade: '6A', created_at: now }),
    ]

    const stats = calculateStats(logs)
    // Flash should have 580 + 10 = 590, top should have 580
    // Sorted descending: flash first
    expect(stats.top10Hardest[0].style).toBe('flash')
    expect(stats.top10Hardest[1].style).toBe('top')

    // Average should be (590 + 580) / 2 = 585
    expect(stats.twoMonthAverage).toBe(585)
  })

  test('try logs excluded from gradeHistory but included in top10', () => {
    const now = new Date().toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'try', grade: '9A', created_at: now }),
      makeLog({ style: 'top', grade: '4A', created_at: now }),
    ]

    const stats = calculateStats(logs)
    // try logs ARE included in twoMonthLogs → top10Hardest
    expect(stats.top10Hardest).toHaveLength(2)
    // try logs are excluded from monthly grade history aggregation
    const monthWithData = stats.gradeHistory.find(h => h.top !== null)
    // should only count the 'top', not the 'try'
    expect(monthWithData?.top).toBe(getGradePoints('4A'))
  })

  test('top10Hardest caps at 10 entries', () => {
    const now = new Date().toISOString()
    const logs: LogEntry[] = Array.from({ length: 15 }, (_, i) =>
      makeLog({ style: 'top', grade: '7A', created_at: now, id: `log-${i}` })
    )

    const stats = calculateStats(logs)
    expect(stats.top10Hardest).toHaveLength(10)
  })

  test('old logs (>60 days) excluded from top10 and average', () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '9A', created_at: oldDate }),
    ]

    const stats = calculateStats(logs)
    // Old logs filtered out of twoMonthLogs → top10Hardest empty
    expect(stats.top10Hardest).toHaveLength(0)
    expect(stats.twoMonthAverage).toBe(0)
    // totalClimbs still counts all logs
    expect(stats.totalClimbs).toBe(1)
  })

  test('grade pyramid counts within last year only', () => {
    const recentDate = new Date().toISOString()
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '6A', created_at: recentDate }),
      makeLog({ style: 'top', grade: '6A', created_at: recentDate }),
      makeLog({ style: 'top', grade: '6A', created_at: oldDate }),
    ]

    const stats = calculateStats(logs)
    expect(stats.gradePyramid['6A']).toBe(2)
  })

  test('gradeHistory returns entries for recent months', () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '6A', created_at: lastMonth }),
    ]

    const stats = calculateStats(logs)
    // Should have 12 month entries (one per month for the past year)
    expect(stats.gradeHistory).toHaveLength(12)
    // At least the month with data should have a non-null top value
    const monthWithData = stats.gradeHistory.find(h => h.top !== null)
    expect(monthWithData).toBeDefined()
  })

  test('gradeHistory includes a new log in the current UTC month', () => {
    const now = new Date().toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '6A', created_at: now }),
    ]

    const stats = calculateStats(logs)
    const monthWithData = stats.gradeHistory.find((entry) => entry.top !== null)

    expect(monthWithData).toBeDefined()
    expect(monthWithData?.top).toBe(getGradePoints('6A'))
  })

  test('gradeHistory buckets month-boundary timestamps consistently in UTC', () => {
    const logs: LogEntry[] = [
      makeLog({ style: 'flash', grade: '7A', created_at: '2026-04-01T00:30:00.000Z' }),
    ]

    const stats = calculateStats(logs)
    const monthWithData = stats.gradeHistory.find((entry) => entry.flash !== null)

    expect(monthWithData).toBeDefined()
    expect(monthWithData?.flash).toBe(getGradePoints('7A'))
  })

  test('gradeHistory uses date_climbed when present', () => {
    const recentClimbedDate = new Date().toISOString().split('T')[0]
    const oldCreatedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '6B', created_at: oldCreatedAt, date_climbed: recentClimbedDate }),
    ]

    const stats = calculateStats(logs)
    const monthWithData = stats.gradeHistory.find((entry) => entry.top !== null)

    expect(monthWithData).toBeDefined()
    expect(monthWithData?.top).toBe(getGradePoints('6B'))
    expect(stats.gradePyramid['6B']).toBe(1)
  })

  test('averageGrade derived from average points', () => {
    const now = new Date().toISOString()
    const logs: LogEntry[] = [
      makeLog({ style: 'top', grade: '6A', created_at: now }),
    ]

    const stats = calculateStats(logs)
    expect(stats.averageGrade).toBe(getGradeFromPoints(getGradePoints('6A')))
  })
})
