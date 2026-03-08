import { type Grade } from '@/lib/grade-constants'
import { clampGradeToPublicRange, getGradeDisplay, getGradeIndex, getGradeMapping, gradeMappings, type GradeMapping, type GradeSystem } from '@/lib/grades'

const V_SCALE_DISPLAY_BY_GRADE: Record<Grade, string> = {
  '4A': 'V0-',
  '4A+': 'V0',
  '4B': 'V0+',
  '4B+': 'V1-',
  '4C': 'V1',
  '4C+': 'V1+',
  '5A': 'V1-2',
  '5A+': 'V2-',
  '5B': 'V2',
  '5B+': 'V2+',
  '5C': 'V2-3',
  '5C+': 'V3-',
  '6A': 'V3',
  '6A+': 'V3-4',
  '6B': 'V4',
  '6B+': 'V4-5',
  '6C': 'V5',
  '6C+': 'V5-6',
  '7A': 'V6',
  '7A+': 'V7-',
  '7B': 'V8-',
  '7B+': 'V8+',
  '7C': 'V9',
  '7C+': 'V10',
  '8A': 'V11',
  '8A+': 'V12',
  '8B': 'V13',
  '8B+': 'V14',
  '8C': 'V15',
  '8C+': 'V16',
  '9A': 'V17',
  '9A+': 'V17+',
  '9B': 'V18',
  '9B+': 'V18+',
  '9C': 'V19',
  '9C+': 'V19+',
}

function toDisplayGrade(grade: string | null | undefined): string | null {
  return clampGradeToPublicRange(grade) ?? grade?.trim().toUpperCase() ?? null
}

function toVGrade(grade: string | null | undefined): string | null {
  const displayGrade = toDisplayGrade(grade)
  if (!displayGrade) return null

  const displayLabel = V_SCALE_DISPLAY_BY_GRADE[displayGrade as Grade]
  if (displayLabel) return displayLabel

  const gradeIndex = getGradeIndex(displayGrade)
  return getGradeDisplay(gradeIndex, 'v_scale') ?? displayGrade
}

export function toWholeVGrade(grade: string | null | undefined): string | null {
  const display = toVGrade(grade)
  if (!display) return null

  const match = /^V(\d+)/i.exec(display)
  if (!match) return null

  return `V${match[1]}`
}

export function formatGradeForDisplay(grade: string | null | undefined, gradeSystem: GradeSystem): string {
  const displayGrade = toDisplayGrade(grade)
  if (!displayGrade) return '—'

  if (gradeSystem === 'v_scale') {
    return toVGrade(displayGrade) ?? displayGrade
  }

  if (gradeSystem === 'font_scale') {
    return displayGrade
  }

  const gradeIndex = getGradeIndex(displayGrade)
  return getGradeDisplay(gradeIndex, gradeSystem) ?? displayGrade
}

export function formatGradeForDisplayWithIndex(
  gradeIndex: number | null | undefined, 
  gradeSystem: GradeSystem,
  fallbackGrade?: string
): string {
  if (gradeIndex === null || gradeIndex === undefined) {
    if (!fallbackGrade) return '—'
    return formatGradeForDisplay(fallbackGrade, gradeSystem)
  }
  
  const mapping = getGradeMapping(gradeIndex)
  if (!mapping) {
    if (!fallbackGrade) return '—'
    return formatGradeForDisplay(fallbackGrade, gradeSystem)
  }
  
  const display = mapping[gradeSystem]
  return display || mapping.font_scale || '—'
}

export { gradeMappings }
export type { GradeMapping }
export type { GradeSystem }
