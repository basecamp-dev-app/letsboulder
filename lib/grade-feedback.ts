import { GRADES } from '@/lib/grades'

export const GRADE_OPINIONS = ['soft', 'agree', 'hard'] as const

export type GradeOpinion = typeof GRADE_OPINIONS[number]

export const GRADE_CONSENSUS_MIN_VOTES = 6
export const GRADE_CONSENSUS_MIN_CONFIDENCE = 0.6

export function getGradeShift(opinion: GradeOpinion): number {
  if (opinion === 'soft') return -1
  if (opinion === 'hard') return 1
  return 0
}

export function clampGradeIndex(index: number): number {
  return Math.min(Math.max(index, 0), GRADES.length - 1)
}
