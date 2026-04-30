import { getGradePoints, type LogEntry } from '@/lib/grades'
import type { ProgressLogEntry } from '@/features/logbook/lib/logbook-view'

export type ProgressRangePreset = '6m' | '1y' | '2y' | 'all'

export interface ProgressChartPoint {
  id: string
  date: string
  timestamp: number
  points: number
  style: 'flash' | 'top'
  grade: string
  climbName: string | null
  flashPoints: number | null
  topPoints: number | null
}

export interface ProgressTrendPoint {
  date: string
  timestamp: number
  flashAveragePoints: number | null
  topAveragePoints: number | null
}

export interface ProgressChartData {
  rangeStart: number | null
  rangeEnd: number
  points: ProgressChartPoint[]
  trend: ProgressTrendPoint[]
  summary: {
    sendCount: number
    bestPoints: number | null
    currentFlashAveragePoints: number | null
    currentTopAveragePoints: number | null
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ROLLING_WINDOW_DAYS = 60

function getLogDate(log: LogEntry): Date {
  if (log.date_climbed) {
    return new Date(`${log.date_climbed}T00:00:00.000Z`)
  }

  return new Date(log.created_at)
}

function getRangeStart(now: Date, range: ProgressRangePreset): Date | null {
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (range === 'all') return null
  if (range === '6m') return new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() - 6, nowUtc.getUTCDate()))
  if (range === '1y') return new Date(Date.UTC(nowUtc.getUTCFullYear() - 1, nowUtc.getUTCMonth(), nowUtc.getUTCDate()))
  return new Date(Date.UTC(nowUtc.getUTCFullYear() - 2, nowUtc.getUTCMonth(), nowUtc.getUTCDate()))
}

const pointDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function buildProgressChartData(logs: Array<LogEntry | ProgressLogEntry>, range: ProgressRangePreset, now = new Date()): ProgressChartData {
  const rangeStart = getRangeStart(now, range)
  const rangeEnd = now.getTime()

  const allPoints = logs
    .filter((log): log is LogEntry & { style: 'flash' | 'top'; climbs: NonNullable<LogEntry['climbs']> } => {
      if (log.style !== 'flash' && log.style !== 'top') return false
      if (!log.climbs?.grade) return false
      return getGradePoints(log.climbs.grade) > 0
    })
    .map((log) => {
      const date = getLogDate(log)
      const pointsValue = getGradePoints(log.climbs.grade)

      return {
        id: log.id,
        date: pointDateFormatter.format(date),
        timestamp: date.getTime(),
        points: pointsValue,
        style: log.style,
        grade: log.climbs.grade,
        climbName: log.climbs.name,
        flashPoints: log.style === 'flash' ? pointsValue : null,
        topPoints: log.style === 'top' ? pointsValue : null,
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp)

  const points = allPoints.filter((point) => !rangeStart || point.timestamp >= rangeStart.getTime())

  const trend = points
    .map((point) => {
      const windowStart = point.timestamp - (ROLLING_WINDOW_DAYS * MS_PER_DAY)
      const windowPoints = allPoints.filter((candidate) => candidate.timestamp >= windowStart && candidate.timestamp <= point.timestamp)
      const flashWindowPoints = windowPoints.filter((candidate) => candidate.style === 'flash')
      const topWindowPoints = windowPoints.filter((candidate) => candidate.style === 'top')

      if (windowPoints.length === 0) return null

      const flashAveragePoints = flashWindowPoints.length > 0
        ? flashWindowPoints.reduce((sum, candidate) => sum + candidate.points, 0) / flashWindowPoints.length
        : null
      const topAveragePoints = topWindowPoints.length > 0
        ? topWindowPoints.reduce((sum, candidate) => sum + candidate.points, 0) / topWindowPoints.length
        : null

      if (flashAveragePoints === null && topAveragePoints === null) return null

      return {
        date: point.date,
        timestamp: point.timestamp,
        flashAveragePoints,
        topAveragePoints,
      }
    })
    .filter((point): point is ProgressTrendPoint => point !== null)

  const currentFlashAveragePoints = [...trend].reverse().find((point) => point.flashAveragePoints !== null)?.flashAveragePoints ?? null
  const currentTopAveragePoints = [...trend].reverse().find((point) => point.topAveragePoints !== null)?.topAveragePoints ?? null

  return {
    rangeStart: rangeStart?.getTime() ?? null,
    rangeEnd,
    points,
    trend,
    summary: {
      sendCount: points.length,
      bestPoints: points.length > 0 ? Math.max(...points.map((point) => point.points)) : null,
      currentFlashAveragePoints,
      currentTopAveragePoints,
    },
  }
}
