import type { Database } from '@/types/database'

export type CragMetadataProposalRow = Database['public']['Tables']['crag_metadata_proposals']['Row']
export type CragMaintainerRow = Database['public']['Tables']['crag_maintainers']['Row']

export interface CragMetadataProposalResult {
  proposalId: string
  status: string
  baseRevisionId: string
  replayed: boolean
}

export interface CragMetadataReviewResult {
  proposalId: string
  status: string
}

export interface CragMetadataReviewItem {
  proposal: CragMetadataProposalRow
  canonical: {
    id: string
    name: string
    regionName: string | null
    subArea: string | null
  }
  proposerName: string | null
  reviewable: boolean
  sourceImage: {
    id: string
    url: string
    createdAt: string | null
  } | null
}

export interface CragMaintainerItem {
  assignment: CragMaintainerRow
  displayName: string | null
  username: string | null
  email: string | null
}
