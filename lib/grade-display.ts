import { gradeMappings, getGradeMapping, type GradeSystem, type GradeMapping } from '@/lib/grades'

const FRENCH_TO_V_DISPLAY: Record<string, string> = {
  '3A': 'V-easy',
  '3A+': 'V-easy',
  '3B': 'V-easy',
  '3B+': 'V-easy',
  '3C': 'V-easy',
  '3C+': 'V-easy',
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

function toVGrade(grade: string): string {
  return FRENCH_TO_V_DISPLAY[grade] || grade
}

export function formatGradeForDisplay(grade: string | null | undefined, gradeSystem: GradeSystem): string {
  const normalized = grade?.trim().toUpperCase()
  if (!normalized) return '—'
  if (gradeSystem === 'v_scale') {
    return toVGrade(normalized)
  }
  return normalized
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
