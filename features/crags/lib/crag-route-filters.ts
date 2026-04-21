import { GRADES } from '@/lib/grades'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))
const gradeOrderIndex = new Map(GRADES.map((grade, index) => [grade, index]))

function getGradeIndex(grade: string) {
  return gradeOrderIndex.get(grade)
}

export function compareGrades(a: string, b: string) {
  const aIndex = getGradeIndex(a)
  const bIndex = getGradeIndex(b)
  if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
  if (aIndex === undefined) return 1
  if (bIndex === undefined) return -1
  return aIndex - bIndex
}

export function normalizeRouteType(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

export function formatRouteTypeLabel(value: string): string {
  return normalizeRouteType(value)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatRatingValue(value: number | null) {
  return value === null ? 'Unrated' : value.toFixed(1)
}

export function getAvailableDirections(routes: CragRoute[]) {
  const seen = new Set<string>()
  for (const route of routes) {
    if (route.directions.length === 0) {
      seen.add('Unknown')
      continue
    }

    for (const direction of route.directions) {
      seen.add(direction)
    }
  }

  return [...seen].sort((a, b) => {
    if (a === 'Unknown' && b !== 'Unknown') return 1
    if (a !== 'Unknown' && b === 'Unknown') return -1
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

export function getRouteTypeChips(routes: CragRoute[]) {
  const uniqueTypes = new Set<string>()
  for (const route of routes) {
    if (!route.routeType) continue
    uniqueTypes.add(normalizeRouteType(route.routeType))
  }

  return [...uniqueTypes].sort((a, b) => a.localeCompare(b))
}

export interface CragRouteFilterState {
  selectedImageId: string | null
  minGrade: string
  maxGrade: string
  minRating: string
  minSends: string
  searchQuery: string
  selectedDirections: string[]
  selectedRouteTypes: string[]
  topoOnly: boolean
}

export function filterAndSortCragRoutes(
  routes: CragRoute[],
  highlightedRouteIds: Set<string>,
  routeSort: 'sends' | 'rating' | 'grade' | 'name',
  filterState: CragRouteFilterState,
) {
  const minIndex = filterState.minGrade ? getGradeIndex(filterState.minGrade) : undefined
  const maxIndex = filterState.maxGrade ? getGradeIndex(filterState.maxGrade) : undefined
  const normalizedSearchQuery = filterState.searchQuery.trim().toLowerCase()
  const minimumRating = filterState.minRating ? Number(filterState.minRating) : null
  const minimumSends = filterState.minSends ? Number(filterState.minSends) : null

  return routes
    .filter((route) => {
      if (filterState.selectedImageId && !highlightedRouteIds.has(route.id)) return false

      const routeGradeIndex = getGradeIndex(route.grade)
      if (minIndex !== undefined) {
        if (routeGradeIndex === undefined || routeGradeIndex < minIndex) return false
      }
      if (maxIndex !== undefined) {
        if (routeGradeIndex === undefined || routeGradeIndex > maxIndex) return false
      }

      if (filterState.selectedDirections.length > 0) {
        const routeDirections = route.directions.length > 0 ? route.directions : ['Unknown']
        if (!routeDirections.some((direction) => filterState.selectedDirections.includes(direction))) return false
      }

      if (filterState.selectedRouteTypes.length > 0) {
        const normalizedRouteType = route.routeType ? normalizeRouteType(route.routeType) : ''
        if (!normalizedRouteType || !filterState.selectedRouteTypes.includes(normalizedRouteType)) return false
      }

      if (filterState.topoOnly && !route.hasTopo) return false
      if (minimumRating !== null && (route.weightedRating === null || route.weightedRating < minimumRating)) return false
      if (minimumSends !== null && route.sendCount < minimumSends) return false

      if (normalizedSearchQuery.length > 0) {
        const searchable = `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase()
        if (!searchable.includes(normalizedSearchQuery)) return false
      }

      return true
    })
    .sort((a, b) => {
      if (routeSort === 'sends') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        if ((a.weightedRating ?? -1) !== (b.weightedRating ?? -1)) return (b.weightedRating ?? -1) - (a.weightedRating ?? -1)
        const gradeCompare = compareGrades(a.grade, b.grade)
        if (gradeCompare !== 0) return gradeCompare
        return a.name.localeCompare(b.name)
      }

      if (routeSort === 'rating') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        if (a.weightedRating === null && b.weightedRating !== null) return 1
        if (a.weightedRating !== null && b.weightedRating === null) return -1
        if (a.weightedRating !== null && b.weightedRating !== null && a.weightedRating !== b.weightedRating) {
          return b.weightedRating - a.weightedRating
        }
        if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        return a.name.localeCompare(b.name)
      }

      if (routeSort === 'name') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        return a.name.localeCompare(b.name)
      }

      const aHighlighted = highlightedRouteIds.has(a.id)
      const bHighlighted = highlightedRouteIds.has(b.id)
      if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
      const gradeCompare = compareGrades(a.grade, b.grade)
      if (gradeCompare !== 0) return gradeCompare
      if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
      return a.name.localeCompare(b.name)
    })
}

export interface CragRouteStats {
  totalRoutes: number
  totalSendsAcrossRoutes: number
  averageRating: number | null
  mostCommonGrade: { grade: string; count: number } | null
  medianGrade: string | null
  routeTypeMix: Array<{ routeType: string; count: number }>
  gradeDistribution: Array<{ grade: string; count: number }>
  sendsByGrade: Array<{ grade: string; sends: number }>
  topoCoverageCount: number
  ratedRoutesCount: number
}

export interface CragRouteSummaries {
  routeTypeChips: string[]
  availableDirections: string[]
  routeStats: CragRouteStats
}

export function buildCragRouteStats(routes: CragRoute[]): CragRouteStats {
  const gradeCounts = new Map<string, number>()
  const sendsByGradeMap = new Map<string, number>()
  const routeTypeCounts = new Map<string, number>()
  let totalSendsAcrossRoutes = 0
  let ratingsWeightedTotal = 0
  let ratingsCountTotal = 0

  for (const route of routes) {
    gradeCounts.set(route.grade, (gradeCounts.get(route.grade) || 0) + 1)
    sendsByGradeMap.set(route.grade, (sendsByGradeMap.get(route.grade) || 0) + route.sendCount)
    totalSendsAcrossRoutes += route.sendCount

    if (route.routeType) {
      const normalizedRouteType = normalizeRouteType(route.routeType)
      routeTypeCounts.set(normalizedRouteType, (routeTypeCounts.get(normalizedRouteType) || 0) + 1)
    }

    if (route.ratingAvg !== null && route.ratingCount > 0) {
      ratingsWeightedTotal += route.ratingAvg * route.ratingCount
      ratingsCountTotal += route.ratingCount
    }
  }

  const gradeDistribution = Array.from(gradeCounts.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sendsByGrade = Array.from(sendsByGradeMap.entries())
    .map(([grade, sends]) => ({ grade, sends }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sortedByGrade = [...routes].sort((a, b) => compareGrades(a.grade, b.grade))
  const medianRoute = sortedByGrade.length > 0 ? sortedByGrade[Math.floor((sortedByGrade.length - 1) / 2)] : null
  const mostCommonGrade = gradeDistribution.reduce<{ grade: string; count: number } | null>((best, current) => {
    if (!best || current.count > best.count) return current
    return best
  }, null)

  const routeTypeMix = Array.from(routeTypeCounts.entries())
    .map(([routeType, count]) => ({ routeType, count }))
    .sort((a, b) => b.count - a.count || a.routeType.localeCompare(b.routeType))

  return {
    totalRoutes: routes.length,
    totalSendsAcrossRoutes,
    averageRating: ratingsCountTotal > 0 ? ratingsWeightedTotal / ratingsCountTotal : null,
    mostCommonGrade,
    medianGrade: medianRoute?.grade || null,
    routeTypeMix,
    gradeDistribution,
    sendsByGrade,
    topoCoverageCount: routes.filter((route) => route.hasTopo).length,
    ratedRoutesCount: routes.filter((route) => route.ratingCount > 0).length,
  }
}

export function buildCragRouteSummaries(routes: CragRoute[]): CragRouteSummaries {
  const seenDirections = new Set<string>()
  const uniqueTypes = new Set<string>()
  const gradeCounts = new Map<string, number>()
  const sendsByGradeMap = new Map<string, number>()
  const routeTypeCounts = new Map<string, number>()
  let totalSendsAcrossRoutes = 0
  let ratingsWeightedTotal = 0
  let ratingsCountTotal = 0
  let topoCoverageCount = 0
  let ratedRoutesCount = 0

  for (const route of routes) {
    gradeCounts.set(route.grade, (gradeCounts.get(route.grade) || 0) + 1)
    sendsByGradeMap.set(route.grade, (sendsByGradeMap.get(route.grade) || 0) + route.sendCount)
    totalSendsAcrossRoutes += route.sendCount

    if (route.directions.length === 0) {
      seenDirections.add('Unknown')
    } else {
      for (const direction of route.directions) {
        seenDirections.add(direction)
      }
    }

    if (route.routeType) {
      const normalizedRouteType = normalizeRouteType(route.routeType)
      uniqueTypes.add(normalizedRouteType)
      routeTypeCounts.set(normalizedRouteType, (routeTypeCounts.get(normalizedRouteType) || 0) + 1)
    }

    if (route.ratingAvg !== null && route.ratingCount > 0) {
      ratingsWeightedTotal += route.ratingAvg * route.ratingCount
      ratingsCountTotal += route.ratingCount
    }

    if (route.hasTopo) topoCoverageCount += 1
    if (route.ratingCount > 0) ratedRoutesCount += 1
  }

  const availableDirections = [...seenDirections].sort((a, b) => {
    if (a === 'Unknown' && b !== 'Unknown') return 1
    if (a !== 'Unknown' && b === 'Unknown') return -1
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })

  const routeTypeChips = [...uniqueTypes].sort((a, b) => a.localeCompare(b))

  const gradeDistribution = Array.from(gradeCounts.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sendsByGrade = Array.from(sendsByGradeMap.entries())
    .map(([grade, sends]) => ({ grade, sends }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sortedByGrade = [...routes].sort((a, b) => compareGrades(a.grade, b.grade))
  const medianRoute = sortedByGrade.length > 0 ? sortedByGrade[Math.floor((sortedByGrade.length - 1) / 2)] : null
  const mostCommonGrade = gradeDistribution.reduce<{ grade: string; count: number } | null>((best, current) => {
    if (!best || current.count > best.count) return current
    return best
  }, null)

  const routeTypeMix = Array.from(routeTypeCounts.entries())
    .map(([routeType, count]) => ({ routeType, count }))
    .sort((a, b) => b.count - a.count || a.routeType.localeCompare(b.routeType))

  return {
    routeTypeChips,
    availableDirections,
    routeStats: {
      totalRoutes: routes.length,
      totalSendsAcrossRoutes,
      averageRating: ratingsCountTotal > 0 ? ratingsWeightedTotal / ratingsCountTotal : null,
      mostCommonGrade,
      medianGrade: medianRoute?.grade || null,
      routeTypeMix,
      gradeDistribution,
      sendsByGrade,
      topoCoverageCount,
      ratedRoutesCount,
    },
  }
}

export function getSearchModalResults(routes: CragRoute[], searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return [] as CragRoute[]
  return routes.filter((route) => `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase().includes(query)).slice(0, 12)
}

export interface ActiveRouteFilterChip {
  key: string
  label: string
}

export function buildActiveRouteFilterChips(
  filterState: CragRouteFilterState,
  gradeFormatter: (grade: string) => string
) {
  const chips: ActiveRouteFilterChip[] = []

  if (filterState.minGrade) {
    chips.push({
      key: 'min-grade',
      label: `Min ${gradeFormatter(filterState.minGrade)}`,
    })
  }

  if (filterState.maxGrade) {
    chips.push({
      key: 'max-grade',
      label: `Max ${gradeFormatter(filterState.maxGrade)}`,
    })
  }

  if (filterState.minRating) {
    chips.push({
      key: 'min-rating',
      label: `${filterState.minRating}+ stars`,
    })
  }

  if (filterState.minSends) {
    chips.push({
      key: 'min-sends',
      label: `${filterState.minSends}+ sends`,
    })
  }

  if (filterState.searchQuery.trim()) {
    chips.push({
      key: 'search',
      label: `Search: ${filterState.searchQuery.trim()}`,
    })
  }

  if (filterState.topoOnly) {
    chips.push({
      key: 'topo-only',
      label: 'Topo only',
    })
  }

  for (const direction of filterState.selectedDirections) {
    chips.push({
      key: `direction-${direction}`,
      label: `Face ${direction}`,
    })
  }

  for (const routeType of filterState.selectedRouteTypes) {
    chips.push({
      key: `route-type-${routeType}`,
      label: formatRouteTypeLabel(routeType),
    })
  }

  return chips
}
