import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { reportError } from '@/lib/errors'

export async function getServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
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

export function getServerClientFromRequest(request: NextRequest) {
  const requestCookies = request.cookies

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return requestCookies.getAll()
        },
        setAll() {},
      },
    }
  )
}

export function getUnauthenticatedClient() {
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}

export interface PlacePin {
  id: string
  name: string
  type: 'crag' | 'gym'
  latitude: number
  longitude: number
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
}

interface PlacePinRow {
  id: string
  name: string
  type: 'crag' | 'gym'
  latitude: number | null
  longitude: number | null
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
}

type ServerSupabaseClient = Awaited<ReturnType<typeof getServerClient>>

export async function fetchMapPinsWithClient(
  supabase: ServerSupabaseClient,
  includePending: boolean
): Promise<PlacePin[]> {
  try {
    const { data, error } = await supabase.rpc('get_place_pins', {
      include_pending: includePending,
    })

    if (error) {
      reportError(error, { message: 'Error fetching map pins' })
      return []
    }

    return ((data || []) as PlacePinRow[])
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        slug: row.slug,
        country_code: row.country_code,
        image_count: row.image_count === null ? null : Number(row.image_count),
        route_count: row.route_count,
      }))
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching map pins' })
    return []
  }
}

export const fetchMapPins = cache(async (): Promise<PlacePin[]> => {
  const includePending = env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES
  const supabase = await getServerClient()

  return fetchMapPinsWithClient(supabase, includePending)
})

export const getCommunityPhotosCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_community_photos_count')

  if (error || !data) return 0
  return data
})

export const getCommunityContributorsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_community_contributors_count')

  if (error || !data) return 0
  return data
})

export const getCragsMappedCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_crags_mapped_count')

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

export const getTotalSendsCount = cache(async (): Promise<number> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_total_sends_count')

  if (error || !data) return 0
  return data
})
