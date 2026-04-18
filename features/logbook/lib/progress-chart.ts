import { getGradePoints, type LogEntry } from '@/lib/grades'

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
  averagePoints: number
}

export interface ProgressChartData {
  points: ProgressChartPoint[]
  trend: ProgressTrendPoint[]
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

export function buildProgressChartData(logs: LogEntry[], range: ProgressRangePreset, now = new Date()): ProgressChartData {
  const rangeStart = getRangeStart(now, range)

  const points = logs
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
    .filter((point) => !rangeStart || point.timestamp >= rangeStart.getTime())
    .sort((a, b) => a.timestamp - b.timestamp)

  const trend = points
    .map((point) => {
      const windowStart = point.timestamp - (ROLLING_WINDOW_DAYS * MS_PER_DAY)
      const windowPoints = points.filter((candidate) => candidate.timestamp >= windowStart && candidate.timestamp <= point.timestamp)

      if (windowPoints.length === 0) return null

      const averagePoints = windowPoints.reduce((sum, candidate) => sum + candidate.points, 0) / windowPoints.length

      return {
        date: point.date,
        timestamp: point.timestamp,
        averagePoints,
      }
    })
    .filter((point): point is ProgressTrendPoint => point !== null)

  return { points, trend }
}
