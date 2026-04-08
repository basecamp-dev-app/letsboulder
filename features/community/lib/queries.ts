export const communityKeys = {
  all: ['community'] as const,
  rankings: (scope: string, sort: string, page: number) =>
    [...communityKeys.all, 'rankings', scope, sort, page] as const,
  recentSends: (slug: string) =>
    [...communityKeys.all, 'recent-sends', slug] as const,
  engagement: (postId: string) =>
    [...communityKeys.all, 'engagement', postId] as const,
  posts: (slug: string) =>
    [...communityKeys.all, 'posts', slug] as const,
}

export interface PlaceRankingEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
}

export interface PlaceRankingPagination {
  page: number
  limit: number
  total_users: number
  total_pages: number
}

export interface PlaceRankingsResponse {
  place: { id: string; name: string; slug: string }
  leaderboard: PlaceRankingEntry[]
  window: '60d' | 'all-time'
  fallback_used: boolean
  pagination: PlaceRankingPagination
}

export async function fetchRankings(
  slug: string,
  sort: 'grade' | 'tops',
  page: number,
  limit = 20
): Promise<PlaceRankingsResponse> {
  const response = await fetch(
    `/api/community/places/${slug}/rankings?sort=${sort}&page=${page}&limit=${limit}`
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch rankings: ${response.status}`)
  }
  return response.json()
}

export async function fetchCragRankings(
  cragId: string,
  sort: 'grade' | 'tops',
  page: number,
  limit = 20
): Promise<{ leaderboard: PlaceRankingEntry[]; window: '60d' | 'all-time'; fallback_used: boolean; pagination: PlaceRankingPagination }> {
  const response = await fetch(
    `/api/crags/${cragId}/rankings?sort=${sort}&page=${page}&limit=${limit}`
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch crag rankings: ${response.status}`)
  }
  return response.json()
}

export interface RecentSendEntry {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  profile: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  climb: {
    id: string
    name: string
    grade: string
  }
  rating: number | null
}

export interface RecentSendsResponse {
  place: { id: string; name: string; slug: string }
  recent_sends: RecentSendEntry[]
}

export async function fetchRecentSends(
  slug: string,
  limit = 10
): Promise<RecentSendsResponse> {
  const response = await fetch(
    `/api/community/places/${slug}/recent-sends?limit=${limit}`
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch recent sends: ${response.status}`)
  }
  return response.json()
}

export interface SessionComment {
  id: string
  body: string
  created_at: string
  author: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
  is_owner: boolean
  is_pending?: boolean
}

export interface PostEngagement {
  rsvp_counts: {
    going: number
    interested: number
  }
  viewer_rsvp: 'going' | 'interested' | null
  comments: SessionComment[]
}

export async function fetchEngagement(
  postId: string
): Promise<PostEngagement> {
  const response = await fetch(`/api/community/posts/${postId}/engagement`)
  if (!response.ok) {
    throw new Error(`Failed to fetch engagement: ${response.status}`)
  }
  return response.json()
}
