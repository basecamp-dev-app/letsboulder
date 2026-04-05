import { GRADE_ORDER_INDEX } from '@/lib/grade-constants'
import type { GradeVoteDistribution } from '@/lib/verification-types'

export function sortVotesByGradeOrder(votes: GradeVoteDistribution[]): GradeVoteDistribution[] {
  return [...votes].sort((a, b) => (GRADE_ORDER_INDEX.get(a.grade) ?? 1e9) - (GRADE_ORDER_INDEX.get(b.grade) ?? 1e9))
}

export function deriveUniqueMode(votes: GradeVoteDistribution[]): { grade: string | null; tied: boolean } {
  if (!votes || votes.length === 0) return { grade: null, tied: false }

  let max = 0
  for (const v of votes) max = Math.max(max, v.vote_count)
  if (max <= 0) return { grade: null, tied: false }

  const top = votes.filter((v) => v.vote_count === max)
  if (top.length === 1) return { grade: top[0]!.grade, tied: false }
  return { grade: top[0]!.grade, tied: true }
}

export function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.max(0, now - d.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
