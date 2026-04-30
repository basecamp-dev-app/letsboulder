import { describe, expect, test } from 'vitest'
import { buildProgressChartData } from '@/features/logbook/lib/progress-chart'
import { getGradePoints, type LogEntry } from '@/lib/grades'

function makeLog(overrides: Partial<LogEntry> & { grade?: string; style?: string }): LogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    climb_id: overrides.climb_id ?? 'climb-1',
    style: overrides.style ?? 'top',
    created_at: overrides.created_at ?? '2026-04-30T12:00:00.000Z',
    date_climbed: overrides.date_climbed,
    climbs: {
      grade: overrides.grade ?? '6A',
      name: overrides.climbs?.name ?? 'Test climb',
    },
  }
}

describe('buildProgressChartData', () => {
  const now = new Date('2026-04-30T12:00:00.000Z')

  test('filters visible points by range', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'old', grade: '7A', created_at: '2025-01-01T12:00:00.000Z' }),
      makeLog({ id: 'recent', grade: '6A', created_at: '2026-04-01T12:00:00.000Z' }),
    ], '1y', now)

    expect(data.points.map((point) => point.id)).toEqual(['recent'])
    expect(data.summary.sendCount).toBe(1)
  })

  test('uses date_climbed before created_at', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'climbed-date', date_climbed: '2026-03-15', created_at: '2024-01-01T12:00:00.000Z' }),
    ], '1y', now)

    expect(data.points).toHaveLength(1)
    expect(new Date(data.points[0].timestamp).toISOString()).toBe('2026-03-15T00:00:00.000Z')
  })

  test('excludes tries and splits flash/top point fields', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'try', style: 'try', grade: '8A' }),
      makeLog({ id: 'flash', style: 'flash', grade: '6B' }),
      makeLog({ id: 'top', style: 'top', grade: '6C' }),
    ], 'all', now)

    expect(data.points.map((point) => point.id)).toEqual(['flash', 'top'])
    expect(data.points[0].flashPoints).toBe(getGradePoints('6B'))
    expect(data.points[0].topPoints).toBeNull()
    expect(data.points[1].flashPoints).toBeNull()
    expect(data.points[1].topPoints).toBe(getGradePoints('6C'))
  })

  test('uses pre-range logs for independent first visible 60-day averages', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'flash-context', style: 'flash', grade: '6A', created_at: '2025-04-15T12:00:00.000Z' }),
      makeLog({ id: 'top-context', style: 'top', grade: '6B', created_at: '2025-04-15T12:00:00.000Z' }),
      makeLog({ id: 'flash-visible', style: 'flash', grade: '7A', created_at: '2025-05-01T12:00:00.000Z' }),
      makeLog({ id: 'top-visible', style: 'top', grade: '7B', created_at: '2025-05-01T12:00:00.000Z' }),
    ], '1y', now)

    const expectedFlashAverage = (getGradePoints('6A') + getGradePoints('7A')) / 2
    const expectedTopAverage = (getGradePoints('6B') + getGradePoints('7B')) / 2

    expect(data.points.map((point) => point.id)).toEqual(['flash-visible', 'top-visible'])
    expect(data.trend[0].flashAveragePoints).toBe(expectedFlashAverage)
    expect(data.trend[0].topAveragePoints).toBe(expectedTopAverage)
    expect(data.summary.currentFlashAveragePoints).toBe(expectedFlashAverage)
    expect(data.summary.currentTopAveragePoints).toBe(expectedTopAverage)
  })

  test('calculates flash and top rolling averages independently', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'flash-low', style: 'flash', grade: '6A', created_at: '2026-04-01T12:00:00.000Z' }),
      makeLog({ id: 'flash-high', style: 'flash', grade: '7A', created_at: '2026-04-20T12:00:00.000Z' }),
      makeLog({ id: 'top', style: 'top', grade: '8A', created_at: '2026-04-20T12:00:00.000Z' }),
    ], '6m', now)

    const expectedFlashAverage = (getGradePoints('6A') + getGradePoints('7A')) / 2

    expect(data.summary.currentFlashAveragePoints).toBe(expectedFlashAverage)
    expect(data.summary.currentTopAveragePoints).toBe(getGradePoints('8A'))
  })

  test('returns empty summary for no sends', () => {
    const data = buildProgressChartData([
      makeLog({ id: 'try', style: 'try', grade: '8A' }),
    ], 'all', now)

    expect(data.points).toEqual([])
    expect(data.trend).toEqual([])
    expect(data.summary).toEqual({
      sendCount: 0,
      bestPoints: null,
      currentFlashAveragePoints: null,
      currentTopAveragePoints: null,
    })
  })
})
