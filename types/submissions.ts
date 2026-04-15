export interface Submission {
  id: string
  canonical_image_id: string | null
  route_image_id?: string | null
  route_line_id?: string | null
  climb_id?: string | null
  country_code?: string | null
  crag_slug?: string | null
  kind: 'submitted' | 'draft'
  status: 'draft' | 'pending_review' | 'published'
  is_optimistic?: boolean
  is_anonymous_submission?: boolean
  url: string
  created_at: string
  updated_at: string
  crag_name: string | null
  route_lines_count: number
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  image_ids?: string[]
  image_count?: number
  draft_preview_bucket?: string | null
  draft_preview_path?: string | null
}

export interface DraftImageRef {
  storage_bucket?: string
  storage_path?: string
  route_data?: unknown
}
