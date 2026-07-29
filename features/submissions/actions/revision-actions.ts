'use server'

import { z } from 'zod'

import type { WikiEntityHistory, WikiEntityKind, WikiRevisionListItem } from '@/features/submissions/lib/revision-types'
import { getActionAuth } from '@/lib/actions/action-auth'
import type { ActionResult } from '@/lib/actions/action-result'
import { fail } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'

type WikiEntityRow = Database['public']['Tables']['wiki_entities']['Row']
type WikiRevisionRow = Database['public']['Tables']['wiki_entity_revisions']['Row']
type WikiCommitRow = Database['public']['Tables']['wiki_revision_commits']['Row']

const historySchema = z.object({
  entityKind: z.enum(['image', 'climb', 'route_line', 'crag']),
  sourceId: z.uuid(),
  cursor: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

const rollbackSchema = z.object({
  targetRevisionId: z.uuid(),
  expectedHeadRevisionId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
})

const sourceColumnByKind = {
  image: 'image_id',
  climb: 'climb_id',
  route_line: 'route_line_id',
  crag: 'crag_id',
} as const satisfies Record<WikiEntityKind, keyof WikiEntityRow>

function profileDisplayName(profile: { display_name: string | null; username: string | null } | undefined) {
  return profile?.display_name?.trim() || profile?.username?.trim() || null
}

export async function getWikiEntityHistoryAction(input: unknown): Promise<ActionResult<WikiEntityHistory>> {
  const validation = validateActionInput(historySchema, input)
  if (!validation.success) return fail<WikiEntityHistory>(validation.result.error || 'Invalid revision query', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const sourceColumn = sourceColumnByKind[validation.data.entityKind]
  const { data: entity, error: entityError } = await supabase
    .from('wiki_entities')
    .select('*')
    .eq('entity_kind', validation.data.entityKind)
    .eq(sourceColumn, validation.data.sourceId)
    .maybeSingle()

  if (entityError) return { success: false, error: 'Failed to load revision entity', status: 500 }
  if (!entity) return { success: false, error: 'Revision history not found', status: 404 }

  const { data: head, error: headError } = await supabase
    .from('wiki_entity_heads')
    .select('revision_id, revision_number')
    .eq('entity_id', entity.id)
    .single()
  if (headError) return { success: false, error: 'Failed to load revision head', status: 500 }

  let revisionsQuery = supabase
    .from('wiki_entity_revisions')
    .select('*')
    .eq('entity_id', entity.id)
    .order('revision_number', { ascending: false })
    .limit(validation.data.limit + 1)
  if (validation.data.cursor) revisionsQuery = revisionsQuery.lt('revision_number', validation.data.cursor)

  const { data: revisionRows, error: revisionsError } = await revisionsQuery
  if (revisionsError) return { success: false, error: 'Failed to load revisions', status: 500 }

  const hasNextPage = revisionRows.length > validation.data.limit
  const pageRows = revisionRows.slice(0, validation.data.limit) as WikiRevisionRow[]
  const commitIds = [...new Set(pageRows.map((revision) => revision.commit_id))]
  const { data: commitRows, error: commitsError } = commitIds.length > 0
    ? await supabase.from('wiki_revision_commits').select('*').in('id', commitIds)
    : { data: [] as WikiCommitRow[], error: null }
  if (commitsError) return { success: false, error: 'Failed to load revision commits', status: 500 }

  const commits = new Map((commitRows as WikiCommitRow[]).map((commit) => [commit.id, commit]))
  const authorIds = [...new Set((commitRows as WikiCommitRow[])
    .map((commit) => commit.author_user_id)
    .filter((id): id is string => typeof id === 'string'))]
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
    : { data: [] }
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))

  const revisions: WikiRevisionListItem[] = pageRows.flatMap((revision) => {
    const commit = commits.get(revision.commit_id)
    if (!commit) return []
    return [{
      id: revision.id,
      entityId: revision.entity_id,
      commitId: revision.commit_id,
      parentRevisionId: revision.parent_revision_id,
      revisionNumber: revision.revision_number,
      schemaVersion: revision.schema_version,
      snapshot: revision.snapshot,
      patch: revision.patch,
      contentHash: revision.content_hash,
      restoredFromRevisionId: revision.restored_from_revision_id,
      supersedesRevisionId: revision.supersedes_revision_id,
      createdAt: revision.created_at,
      commit: {
        authorUserId: commit.author_user_id,
        authorDisplayName: commit.author_user_id ? profileDisplayName(profilesById.get(commit.author_user_id)) : null,
        authorKind: commit.author_kind,
        revisionKind: commit.revision_kind,
        summary: commit.summary,
        metadata: commit.metadata,
        createdAt: commit.created_at,
      },
    }]
  })

  return {
    success: true,
    data: {
      entityId: entity.id,
      entityKind: entity.entity_kind as WikiEntityKind,
      sourceId: validation.data.sourceId,
      headRevisionId: head.revision_id,
      headRevisionNumber: head.revision_number,
      revisions,
      nextCursor: hasNextPage ? pageRows.at(-1)?.revision_number || null : null,
    },
  }
}

export async function rollbackWikiEntityRevisionAction(input: unknown): Promise<ActionResult<{
  commitId: string
  revisionId: string
  entityId: string
}>> {
  const validation = validateActionInput(rollbackSchema, input)
  if (!validation.success) return fail(validation.result.error || 'Invalid rollback request', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('rollback_wiki_entity_revision', {
    p_target_revision_id: validation.data.targetRevisionId,
    p_expected_head_revision_id: validation.data.expectedHeadRevisionId,
    p_reason: validation.data.reason,
  })

  if (error) {
    if (error.code === '40001' || error.details === 'wiki_revision_conflict') {
      return { success: false, error: 'This entity changed before the rollback could be applied.', status: 409 }
    }
    if (error.code === '42501') return { success: false, error: 'Administrator access required', status: 403 }
    if (error.code === 'P0002') return { success: false, error: error.message, status: 404 }
    if (error.code === '22023') return { success: false, error: error.message, status: 400 }
    return { success: false, error: 'Failed to roll back revision', status: 500 }
  }

  const result = data?.[0]
  if (!result) return { success: false, error: 'Rollback returned no revision', status: 500 }
  return {
    success: true,
    data: { commitId: result.commit_id, revisionId: result.revision_id, entityId: result.entity_id },
  }
}
