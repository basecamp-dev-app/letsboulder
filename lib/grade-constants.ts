export const VALID_GRADES = [
  '3A', '3A+', '3B', '3B+', '3C', '3C+',
  '4A', '4A+', '4B', '4B+', '4C', '4C+',
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+',
] as const

export type Grade = typeof VALID_GRADES[number]

export const MIN_SELECTABLE_GRADE: Grade = '3A'

export const SELECTABLE_GRADES = VALID_GRADES.slice(
  Math.max(0, VALID_GRADES.indexOf(MIN_SELECTABLE_GRADE))
) as readonly Grade[]

export const GRADE_ORDER_INDEX = new Map<string, number>(
  VALID_GRADES.map((grade, index) => [grade, index])
)

export function isValidGrade(grade: string): grade is Grade {
  return VALID_GRADES.includes(grade as Grade)
}
