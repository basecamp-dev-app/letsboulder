type ServerClient = Awaited<ReturnType<typeof import('@/lib/supabase-server').getServerClient>>

interface UpsertGradeVoteInput {
  supabase: ServerClient
  entityId: string
  userId: string
  grade: string
}

interface LoadGradeDistributionInput {
  supabase: ServerClient
  entityId: string
}

export interface GradeDistributionItem {
  grade: string
  vote_count: number
}

export async function upsertGradeVote(input: UpsertGradeVoteInput) {
  const { supabase, entityId, userId, grade } = input

  return supabase
    .from('grade_votes')
    .upsert(
      {
        climb_id: entityId,
        user_id: userId,
        grade,
      },
      {
        onConflict: 'climb_id,user_id',
      }
    )
}

export async function loadGradeDistribution(input: LoadGradeDistributionInput): Promise<{
  voteCount: number
  distribution: GradeDistributionItem[]
  consensusGrade: string | null
  error: unknown
}> {
  const { supabase, entityId } = input
  const { data, error } = await supabase.from('grade_votes').select('grade').eq('climb_id', entityId)

  if (error) {
    return {
      voteCount: 0,
      distribution: [],
      consensusGrade: null,
      error,
    }
  }

  const counts = (data || []).reduce<Record<string, number>>((acc, row) => {
    const grade = row.grade
    acc[grade] = (acc[grade] || 0) + 1
    return acc
  }, {})

  const distribution: GradeDistributionItem[] = Object.entries(counts)
    .map(([grade, vote_count]) => ({ grade, vote_count }))
    .sort((a, b) => b.vote_count - a.vote_count)

  return {
    voteCount: data?.length || 0,
    distribution,
    consensusGrade: distribution[0]?.grade || null,
    error: null,
  }
}

export function buildConsensusUpdates(rows: Array<{ climb_id: string | null; grade: string | null }>) {
  const rowsByClimbId = new Map<string, Array<{ climb_id: string | null; grade: string | null }>>()

  for (const row of rows) {
    const climbId = typeof row.climb_id === 'string' ? row.climb_id : null
    if (!climbId) continue
    const currentRows = rowsByClimbId.get(climbId) || []
    currentRows.push(row)
    rowsByClimbId.set(climbId, currentRows)
  }

  return Array.from(rowsByClimbId.entries())
    .map(([climbId, climbRows]) => {
      const countByGrade = new Map<string, number>()
      for (const row of climbRows) {
        const grade = typeof row.grade === 'string' ? row.grade : null
        if (!grade) continue
        countByGrade.set(grade, (countByGrade.get(grade) || 0) + 1)
      }

      let topGrade: string | null = null
      let topCount = 0
      let tied = false

      for (const [grade, count] of countByGrade.entries()) {
        if (count > topCount) {
          topGrade = grade
          topCount = count
          tied = false
          continue
        }

        if (count === topCount) {
          tied = true
        }
      }

      if (tied || !topGrade) return null
      return { id: climbId, grade: topGrade }
    })
    .filter((value): value is { id: string; grade: string } => value !== null)
}
