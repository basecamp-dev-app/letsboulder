type ServerClient = Awaited<ReturnType<typeof import('@/lib/supabase-server').getServerClient>>

interface FlagDuplicateLookupInput {
  climbId?: string | null
  cragId?: string | null
  imageId?: string | null
}

interface CreateFlagInput extends FlagDuplicateLookupInput {
  supabase: ServerClient
  userId: string
  flagType: string
  comment: string
}

interface CreateFlagResult {
  created: boolean
  duplicate: boolean
  error: unknown
}

export async function createFlag(input: CreateFlagInput): Promise<CreateFlagResult> {
  const { supabase, userId, flagType, comment, climbId = null, cragId = null, imageId = null } = input

  let duplicateQuery = supabase
    .from('climb_flags')
    .select('id, status')
    .eq('flagger_id', userId)
    .eq('status', 'pending')

  if (imageId) {
    duplicateQuery = duplicateQuery.eq('image_id', imageId)
  } else if (climbId) {
    duplicateQuery = duplicateQuery.eq('climb_id', climbId)
  } else {
    duplicateQuery = duplicateQuery.eq('crag_id', cragId ?? '')
  }

  const { data: existingFlag, error: duplicateError } = await duplicateQuery.maybeSingle()
  if (duplicateError) {
    return { created: false, duplicate: false, error: duplicateError }
  }

  if (existingFlag) {
    return { created: false, duplicate: true, error: null }
  }

  const { error } = await supabase.from('climb_flags').insert({
    climb_id: climbId,
    crag_id: cragId,
    image_id: imageId,
    flagger_id: userId,
    flag_type: flagType,
    comment,
    status: 'pending',
  })

  return { created: !error, duplicate: false, error }
}
