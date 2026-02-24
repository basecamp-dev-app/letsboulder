export const FLASH_BONUS = 10

export const GRADE_SYSTEMS = ['v_scale', 'font_scale', 'yds_equivalent', 'french_equivalent'] as const
export type GradeSystem = typeof GRADE_SYSTEMS[number]

export type DifficultyGroup = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | 'Elite'

export interface GradeMapping {
  grade_index: number
  v_scale: string
  font_scale: string
  yds_equivalent: string
  french_equivalent: string
  difficulty_group: DifficultyGroup
}

export const gradeMappings: GradeMapping[] = [
  { grade_index: 0, v_scale: 'VB', font_scale: '3', yds_equivalent: '5.6', french_equivalent: '4', difficulty_group: 'Beginner' },
  { grade_index: 1, v_scale: 'V0', font_scale: '4', yds_equivalent: '5.9', french_equivalent: '5', difficulty_group: 'Beginner' },
  { grade_index: 2, v_scale: 'V1', font_scale: '5', yds_equivalent: '5.10a', french_equivalent: '6a', difficulty_group: 'Intermediate' },
  { grade_index: 3, v_scale: 'V2', font_scale: '5+', yds_equivalent: '5.10c', french_equivalent: '6a+', difficulty_group: 'Intermediate' },
  { grade_index: 4, v_scale: 'V3', font_scale: '6A', yds_equivalent: '5.11a', french_equivalent: '6b', difficulty_group: 'Intermediate' },
  { grade_index: 5, v_scale: 'V4', font_scale: '6B', yds_equivalent: '5.11c', french_equivalent: '6c', difficulty_group: 'Advanced' },
  { grade_index: 6, v_scale: 'V5', font_scale: '6C', yds_equivalent: '5.12a', french_equivalent: '7a', difficulty_group: 'Advanced' },
  { grade_index: 7, v_scale: 'V6', font_scale: '6C+', yds_equivalent: '5.12b', french_equivalent: '7a+', difficulty_group: 'Advanced' },
  { grade_index: 8, v_scale: 'V7', font_scale: '7A', yds_equivalent: '5.13a', french_equivalent: '7b', difficulty_group: 'Expert' },
  { grade_index: 9, v_scale: 'V8', font_scale: '7B', yds_equivalent: '5.13b', french_equivalent: '7c', difficulty_group: 'Expert' },
  { grade_index: 10, v_scale: 'V9', font_scale: '7B+', yds_equivalent: '5.13c', french_equivalent: '7c+', difficulty_group: 'Expert' },
  { grade_index: 11, v_scale: 'V10', font_scale: '7C', yds_equivalent: '5.14a', french_equivalent: '8a', difficulty_group: 'Elite' },
  { grade_index: 12, v_scale: 'V11', font_scale: '8A', yds_equivalent: '5.14c', french_equivalent: '8a+', difficulty_group: 'Elite' },
  { grade_index: 13, v_scale: 'V12', font_scale: '8A+', yds_equivalent: '5.15a', french_equivalent: '8b', difficulty_group: 'Elite' },
  { grade_index: 14, v_scale: 'V13', font_scale: '8B', yds_equivalent: '5.15b', french_equivalent: '8c', difficulty_group: 'Elite' },
  { grade_index: 15, v_scale: 'V14', font_scale: '8B+', yds_equivalent: '5.15c', french_equivalent: '9a', difficulty_group: 'Elite' },
  { grade_index: 16, v_scale: 'V15', font_scale: '8C', yds_equivalent: '5.15d', french_equivalent: '9a+', difficulty_group: 'Elite' },
  { grade_index: 17, v_scale: 'V16', font_scale: '8C+', yds_equivalent: '5.16a', french_equivalent: '9b', difficulty_group: 'Elite' },
]

const gradeIndexMap: Record<number, GradeMapping> = Object.fromEntries(
  gradeMappings.map(g => [g.grade_index, g])
)

const vScaleToIndex: Record<string, number> = Object.fromEntries(
  gradeMappings.map(g => [g.v_scale, g.grade_index])
)

const fontScaleToIndex: Record<string, number> = Object.fromEntries(
  gradeMappings.map(g => [g.font_scale, g.grade_index])
)

const frenchToIndex: Record<string, number> = Object.fromEntries(
  gradeMappings.map(g => [g.french_equivalent, g.grade_index])
)

export function getGradeDisplay(gradeIndex: number | null | undefined, system: GradeSystem): string | null {
  if (gradeIndex === null || gradeIndex === undefined) return null
  const mapping = gradeIndexMap[gradeIndex]
  if (!mapping) return null
  return mapping[system]
}

export function getGradeIndex(gradeString: string | null | undefined): number | null {
  if (!gradeString) return null
  const normalized = gradeString.trim().toUpperCase()
  
  if (vScaleToIndex[normalized] !== undefined) return vScaleToIndex[normalized]
  if (fontScaleToIndex[normalized] !== undefined) return fontScaleToIndex[normalized]
  
  const lower = gradeString.trim().toLowerCase()
  if (frenchToIndex[lower] !== undefined) return frenchToIndex[lower]
  
  return null
}

export function getDifficultyGroup(gradeIndex: number | null | undefined): DifficultyGroup | null {
  if (gradeIndex === null || gradeIndex === undefined) return null
  return gradeIndexMap[gradeIndex]?.difficulty_group ?? null
}

export function getGradeMapping(gradeIndex: number | null | undefined): GradeMapping | null {
  if (gradeIndex === null || gradeIndex === undefined) return null
  return gradeIndexMap[gradeIndex] ?? null
}

export function getNextGradeIndex(currentIndex: number): number | null {
  const next = gradeMappings.find(g => g.grade_index > currentIndex)
  return next?.grade_index ?? null
}

export function getPreviousGradeIndex(currentIndex: number): number | null {
  const prev = [...gradeMappings].reverse().find(g => g.grade_index < currentIndex)
  return prev?.grade_index ?? null
}

export function getClosestGradeIndex(points: number): number {
  const basePoints = 400
  const increment = 16
  const calculatedIndex = Math.round((points - basePoints) / increment)
  return Math.max(0, Math.min(17, calculatedIndex))
}

const gradeToPointsMap: Record<string, number> = {
  '1A': 100, '1A+': 116, '1B': 132, '1B+': 148, '1C': 164, '1C+': 180,
  '2A': 196, '2A+': 212, '2B': 228, '2B+': 244, '2C': 260, '2C+': 276,
  '3A': 292, '3A+': 308, '3B': 324, '3B+': 340, '3C': 356, '3C+': 372,
  '4A': 388, '4A+': 404, '4B': 420, '4B+': 436, '4C': 452, '4C+': 468,
  '5A': 484, '5A+': 500, '5B': 516, '5B+': 532, '5C': 548, '5C+': 564,
  '6A': 580, '6A+': 596, '6B': 612, '6B+': 628, '6C': 644, '6C+': 660,
  '7A': 676, '7A+': 692, '7B': 708, '7B+': 724, '7C': 740, '7C+': 756,
  '8A': 772, '8A+': 788, '8B': 804, '8B+': 820, '8C': 836, '8C+': 852,
  '9A': 868, '9A+': 884, '9B': 900, '9B+': 916, '9C': 932, '9C+': 948,
}

export function normalizeGrade(grade: string | null | undefined): string | null {
  if (!grade) return null
  return grade.trim().toUpperCase()
}

export function getGradePoints(grade: string | null | undefined): number {
  const normalized = normalizeGrade(grade)
  return normalized ? (gradeToPointsMap[normalized] || 0) : 0
}

export const gradePoints: Record<string, number> = gradeToPointsMap

export const GRADES = Object.keys(gradeToPointsMap).sort((a, b) => 
  gradeToPointsMap[a] - gradeToPointsMap[b]
)

export function getGradeFromPoints(points: number): string {
  let closest = '6A'
  let minDiff = Infinity
  
  for (const [grade, gradePointsVal] of Object.entries(gradeToPointsMap)) {
    const diff = Math.abs(gradePointsVal - points)
    if (diff < minDiff) {
      minDiff = diff
      closest = grade
    }
  }
  
  return closest
}

export function getFlashPoints(grade: string): number {
  return getGradePoints(grade) + FLASH_BONUS
}

export function getNextGrade(currentGrade: string): string {
  const currentIndex = GRADES.indexOf(currentGrade)
  if (currentIndex === -1 || currentIndex === GRADES.length - 1) {
    return currentGrade
  }
  return GRADES[currentIndex + 1]
}

export function getPreviousGrade(currentGrade: string): string {
  const currentIndex = GRADES.indexOf(currentGrade)
  if (currentIndex <= 0) {
    return currentGrade
  }
  return GRADES[currentIndex - 1]
}

export function getProgressPercent(currentPoints: number, previousGrade: string, nextGrade: string): number {
  const previousPoints = gradeToPointsMap[previousGrade]
  const nextPoints = gradeToPointsMap[nextGrade]
  
  if (!previousPoints || !nextPoints || nextPoints <= previousPoints) {
    return 0
  }
  
  const percent = ((currentPoints - previousPoints) / (nextPoints - previousPoints)) * 100
  return Math.min(Math.max(Math.round(percent), 0), 100)
}

export function getInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export interface LogEntry {
  id: string
  climb_id: string
  style: string
  created_at: string
  climbs?: {
    grade: string
    grade_index?: number | null
    name: string | null
    image_url?: string | null
    crags?: {
      name: string | null
    } | null
  }
}

interface MonthlyGradeData {
  month: string
  top: number | null
  flash: number | null
}

interface StatsResult {
  top10Hardest: LogEntry[]
  twoMonthAverage: number
  gradeHistory: MonthlyGradeData[]
  gradePyramid: Record<string, number>
  averageGrade: string
  totalClimbs: number
  totalFlashes: number
  totalTops: number
  totalTries: number
}

export function calculateStats(logs: LogEntry[]): StatsResult {
  if (logs.length === 0) {
    return {
      top10Hardest: [],
      twoMonthAverage: 0,
      gradeHistory: [],
      gradePyramid: {},
      averageGrade: '6A',
      totalClimbs: 0,
      totalFlashes: 0,
      totalTops: 0,
      totalTries: 0,
    }
  }

  const now = new Date()
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  const twoMonthLogs = logs.filter(log => new Date(log.created_at) >= twoMonthsAgo)
  const yearLogs = logs.filter(log => new Date(log.created_at) >= oneYearAgo)

  const twoMonthWithPoints = twoMonthLogs.map(log => {
    const basePoints = getGradePoints(log.climbs?.grade || '6A')
    const points = log.style === 'flash' ? basePoints + FLASH_BONUS : basePoints
    return { ...log, points }
  }).sort((a, b) => b.points - a.points)

  const top10Hardest = twoMonthWithPoints.slice(0, 10)

  const avgPoints = twoMonthWithPoints.length > 0
    ? twoMonthWithPoints.reduce((sum, log) => sum + log.points, 0) / twoMonthWithPoints.length
    : 0

  const monthlyData: Record<string, { topPoints: number; topCount: number; flashPoints: number; flashCount: number }> = {}
  
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    monthlyData[monthKey] = { topPoints: 0, topCount: 0, flashPoints: 0, flashCount: 0 }
  }

  yearLogs.forEach(log => {
    const logDate = new Date(log.created_at)
    const monthKey = logDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    
    if (monthlyData[monthKey]) {
      if (log.style === 'try') return

      const points = getGradePoints(log.climbs?.grade || '6A')
      if (log.style === 'flash') {
        monthlyData[monthKey].flashPoints += points
        monthlyData[monthKey].flashCount += 1

        monthlyData[monthKey].topPoints += points
        monthlyData[monthKey].topCount += 1
        return
      }

      monthlyData[monthKey].topPoints += points
      monthlyData[monthKey].topCount += 1
    }
  })

  const gradeHistory = Object.entries(monthlyData)
    .map(([month, data]) => ({
      month,
      top: data.topCount > 0 ? data.topPoints / data.topCount : null,
      flash: data.flashCount > 0 ? data.flashPoints / data.flashCount : null,
    }))
    .sort((a, b) => {
      const [aMonth, aYear] = a.month.split(' ')
      const [bMonth, bYear] = b.month.split(' ')
      const aDate = new Date(`${aMonth} 20${aYear}`)
      const bDate = new Date(`${bMonth} 20${bYear}`)
      return aDate.getTime() - bDate.getTime()
    })

  const gradePyramid: Record<string, number> = {}
  GRADES.forEach(grade => gradePyramid[grade] = 0)

  yearLogs.forEach(log => {
    const normalizedGrade = normalizeGrade(log.climbs?.grade)
    if (normalizedGrade && gradePyramid[normalizedGrade] !== undefined) {
      gradePyramid[normalizedGrade]++
    }
  })

  const totalFlashes = logs.filter(l => l.style === 'flash').length
  const totalTops = logs.filter(l => l.style === 'top').length
  const totalTries = logs.filter(l => l.style === 'try').length

  return {
    top10Hardest,
    twoMonthAverage: avgPoints,
    gradeHistory,
    gradePyramid,
    averageGrade: getGradeFromPoints(avgPoints),
    totalClimbs: logs.length,
    totalFlashes,
    totalTops,
    totalTries,
  }
}

export function getLowestGrade(gradePyramid: Record<string, number>): string {
  for (const grade of GRADES) {
    if (gradePyramid[grade] > 0) {
      return grade
    }
  }
  return '6A'
}

export const DEFAULT_GRADE_SYSTEM: GradeSystem = 'font_scale'

export const DIFFICULTY_COLORS: Record<DifficultyGroup, string> = {
  Beginner: 'text-green-500',
  Intermediate: 'text-blue-500',
  Advanced: 'text-orange-500',
  Expert: 'text-red-500',
  Elite: 'text-red-700',
}
