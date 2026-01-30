// French Boulder Grade System (Fontainebleau)
// Points system: Base grades + modifier steps + flash bonus (+10 points)
// Complete scale: 1A through 9C+

export const FLASH_BONUS = 10

const gradeToPointsMap: Record<string, number> = {
  // 1A–3C+
  '1A': 100, '1A+': 116, '1B': 132, '1B+': 148, '1C': 164, '1C+': 180,
  // 2A–4C+
  '2A': 196, '2A+': 212, '2B': 228, '2B+': 244, '2C': 260, '2C+': 276,
  // 3A–5C+
  '3A': 292, '3A+': 308, '3B': 324, '3B+': 340, '3C': 356, '3C+': 372,
  // 4A–6C+
  '4A': 388, '4A+': 404, '4B': 420, '4B+': 436, '4C': 452, '4C+': 468,
  // 5A–6C+
  '5A': 484, '5A+': 500, '5B': 516, '5B+': 532, '5C': 548, '5C+': 564,
  // 6A–7C+
  '6A': 580, '6A+': 596, '6B': 612, '6B+': 628, '6C': 644, '6C+': 660,
  // 7A–8C+
  '7A': 676, '7A+': 692, '7B': 708, '7B+': 724, '7C': 740, '7C+': 756,
  // 8A–9C+
  '8A': 772, '8A+': 788, '8B': 804, '8B+': 820, '8C': 836, '8C+': 852,
  // 9A–9C+
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
  style: string
  created_at: string
  climbs?: {
    grade: string
    name: string | null
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

  // Filter logs
  const twoMonthLogs = logs.filter(log => new Date(log.created_at) >= twoMonthsAgo)
  const yearLogs = logs.filter(log => new Date(log.created_at) >= oneYearAgo)

  // Calculate 2-month average (top 10 hardest with flash bonus)
  const twoMonthWithPoints = twoMonthLogs.map(log => {
    const basePoints = getGradePoints(log.climbs?.grade || '6A')
    const points = log.style === 'flash' ? basePoints + FLASH_BONUS : basePoints
    return { ...log, points }
  }).sort((a, b) => b.points - a.points)

  const top10Hardest = twoMonthWithPoints.slice(0, 10)

  const avgPoints = twoMonthWithPoints.length > 0
    ? twoMonthWithPoints.reduce((sum, log) => sum + log.points, 0) / twoMonthWithPoints.length
    : 0

  // Calculate grade history (monthly average grade)
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

        // "Top" series includes all sends (tops + flashes)
        monthlyData[monthKey].topPoints += points
        monthlyData[monthKey].topCount += 1
        return
      }

      monthlyData[monthKey].topPoints += points
      monthlyData[monthKey].topCount += 1
    }
  })

  // Sort months chronologically
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

  // Calculate grade pyramid
  const gradePyramid: Record<string, number> = {}
  GRADES.forEach(grade => gradePyramid[grade] = 0)

  yearLogs.forEach(log => {
    const normalizedGrade = normalizeGrade(log.climbs?.grade)
    if (normalizedGrade && gradePyramid[normalizedGrade] !== undefined) {
      gradePyramid[normalizedGrade]++
    }
  })

  // Calculate totals
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
