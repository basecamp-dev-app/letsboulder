import type { Database, Json } from '@/types/database'

export type WikiEntityKind = Database['public']['Tables']['wiki_entities']['Row']['entity_kind']
export type WikiRevisionKind = Database['public']['Tables']['wiki_revision_commits']['Row']['revision_kind']

export interface WikiRevisionListItem {
  id: string
  entityId: string
  commitId: string
  parentRevisionId: string | null
  revisionNumber: number
  schemaVersion: number
  snapshot: Json
  patch: Json
  contentHash: string
  restoredFromRevisionId: string | null
  supersedesRevisionId: string | null
  createdAt: string
  commit: {
    authorUserId: string | null
    authorDisplayName: string | null
    authorKind: string
    revisionKind: WikiRevisionKind
    summary: string
    metadata: Json
    createdAt: string
  }
}

export interface WikiEntityHistory {
  entityId: string
  entityKind: WikiEntityKind
  sourceId: string
  headRevisionId: string
  headRevisionNumber: number
  revisions: WikiRevisionListItem[]
  nextCursor: number | null
}
