export type CommunityPostType = 'session' | 'update' | 'conditions' | 'question'

export interface CommunityAuthor {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export interface CommunitySessionPost {
  id: string
  author_id: string
  place_id: string
  type: 'session'
  title: string | null
  body: string
  discipline: string | null
  grade_min: string | null
  grade_max: string | null
  start_at: string
  end_at: string | null
  created_at: string
  updated_at: string
  author: CommunityAuthor | null
}

export interface CommunityUpdatePost {
  id: string
  author_id: string
  place_id: string
  type: Exclude<CommunityPostType, 'session'>
  title: string | null
  body: string
  discipline: string | null
  created_at: string
  updated_at: string
  author: CommunityAuthor | null
}
