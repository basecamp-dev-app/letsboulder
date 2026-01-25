import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function getServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

export const getRegisteredUserCount = cache(async (): Promise<string> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_user_count')

  if (error || !data) return '0'
  return formatNumber(data)
})

export const getVerifiedRoutesCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_verified_routes_count')

  if (error || !data) return 0
  return data
})

export const getTotalSendsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_total_sends_count')

  if (error || !data) return 0
  return data
})

export const getBouldersWithGpsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_boulders_with_gps_count')

  if (error || !data) return 0
  return data
})

export const getCommunityPhotosCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_community_photos_count')

  if (error || !data) return 0
  return data
})

export const getActiveClimbersCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_active_climbers_count')

  if (error || !data) return 0
  return data
})

export const getTotalClimbsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_total_climbs_count')

  if (error || !data) return 0
  return data
})

export const getTotalLogsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_total_logs_count')

  if (error || !data) return 0
  return data
})
