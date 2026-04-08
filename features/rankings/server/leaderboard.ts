import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type RankingSort = 'grade' | 'tops'

type RankingsRow = Database['public']['Functions']['get_rankings_leaderboard']['Returns'][number]
type PlaceRankingsRow = Database['public']['Functions']['get_place_rankings_leaderboard']['Returns'][number]
type CragRankingsRow = Database['public']['Functions']['get_crag_rankings_leaderboard']['Returns'][number]

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
}

export interface LeaderboardPage {
  leaderboard: LeaderboardEntry[]
  totalUsers: number
}

function mapLeaderboardRows(rows: Array<RankingsRow | PlaceRankingsRow> | null | undefined): LeaderboardPage {
  const leaderboard = (rows || []).map((row) => ({
    rank: Number(row.rank),
    user_id: row.user_id,
    username: row.username,
    avatar_url: row.avatar_url,
    avg_grade: row.avg_grade,
    climb_count: Number(row.climb_count),
  }))

  return {
    leaderboard,
    totalUsers: rows && rows.length > 0 ? Number(rows[0].total_users) : 0,
  }
}

function mapGenericLeaderboardRows(rows: Array<RankingsRow | PlaceRankingsRow | CragRankingsRow> | null | undefined): LeaderboardPage {
  const leaderboard = (rows || []).map((row) => ({
    rank: Number(row.rank),
    user_id: row.user_id,
    username: row.username,
    avatar_url: row.avatar_url,
    avg_grade: row.avg_grade,
    climb_count: Number(row.climb_count),
  }))

  return {
    leaderboard,
    totalUsers: rows && rows.length > 0 ? Number(rows[0].total_users) : 0,
  }
}

export async function loadGlobalRankingsLeaderboard(
  supabase: SupabaseClient<Database>,
  params: {
    gender: string | null
    regionId: string | null
    sort: RankingSort
    page: number
    limit: number
    windowStart: string | null
  }
): Promise<{ data: LeaderboardPage | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_rankings_leaderboard', {
    p_gender: params.gender,
    p_region_id: params.regionId,
    p_sort: params.sort,
    p_page: params.page,
    p_limit: params.limit,
    p_window_start: params.windowStart,
  })

  return {
    data: error ? null : mapLeaderboardRows(data),
    error,
  }
}

export async function loadPlaceRankingsLeaderboard(
  supabase: SupabaseClient<Database>,
  params: {
    placeId: string
    sort: RankingSort
    page: number
    limit: number
    windowStart: string | null
  }
): Promise<{ data: LeaderboardPage | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_place_rankings_leaderboard', {
    p_place_id: params.placeId,
    p_sort: params.sort,
    p_page: params.page,
    p_limit: params.limit,
    p_window_start: params.windowStart,
  })

  return {
    data: error ? null : mapLeaderboardRows(data),
    error,
  }
}

export async function loadCragRankingsLeaderboard(
  supabase: SupabaseClient<Database>,
  params: {
    cragId: string
    sort: RankingSort
    page: number
    limit: number
    windowStart: string | null
  }
): Promise<{ data: LeaderboardPage | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_crag_rankings_leaderboard', {
    p_crag_id: params.cragId,
    p_sort: params.sort,
    p_page: params.page,
    p_limit: params.limit,
    p_window_start: params.windowStart,
  })

  return {
    data: error ? null : mapGenericLeaderboardRows(data),
    error,
  }
}
