export interface Submission {
  id: string
  kind: 'submitted' | 'draft'
  url: string
  created_at: string
  updated_at: string
  crag_name: string | null
  route_lines_count: number
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

export interface DraftImageRef {
  storage_bucket?: string
  storage_path?: string
  route_data?: unknown
}
