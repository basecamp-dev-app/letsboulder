import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

export async function getServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
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

  return createServerClient<Database>(
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

export function getRouteClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies) {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )
}

export function getUnauthenticatedClient() {
  return createServerClient<Database>(
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

export interface ViewportMapFeature {
  id: string
  name: string | null
  type: 'crag' | 'gym' | 'cluster'
  latitude: number
  longitude: number
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
  is_cluster: boolean
  point_count: number
}

type GeneratedViewportMapFeatureRow = Database['public']['Functions']['get_viewport_map_features']['Returns'][number]
type ViewportMapFeatureRow = Omit<GeneratedViewportMapFeatureRow, 'name' | 'slug' | 'country_code' | 'image_count' | 'route_count'> & {
  name: string | null
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
}

type ServerSupabaseClient = Awaited<ReturnType<typeof getServerClient>>

async function fetchViewportMapFeaturesRpc(
  supabase: ServerSupabaseClient,
  bounds: { north: number; south: number; east: number; west: number; zoom: number },
  rpc: 'get_viewport_map_features' | 'get_admin_viewport_map_features'
): Promise<ViewportMapFeature[]> {
  const { data, error } = await supabase.rpc(rpc, {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west,
    p_zoom: bounds.zoom,
  })

  if (error) throw error

  return ((data || []) as ViewportMapFeatureRow[]).map((row) => ({
    ...row,
    type: row.is_cluster ? 'cluster' : row.type === 'gym' ? 'gym' : 'crag',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    image_count: row.image_count === null ? null : Number(row.image_count),
    route_count: row.route_count === null ? null : Number(row.route_count),
    point_count: Number(row.point_count),
  }))
}

export function fetchViewportMapFeaturesWithClient(
  supabase: ServerSupabaseClient,
  bounds: { north: number; south: number; east: number; west: number; zoom: number },
) {
  return fetchViewportMapFeaturesRpc(supabase, bounds, 'get_viewport_map_features')
}

export function fetchAdminViewportMapFeaturesWithClient(
  supabase: ServerSupabaseClient,
  bounds: { north: number; south: number; east: number; west: number; zoom: number },
) {
  return fetchViewportMapFeaturesRpc(supabase, bounds, 'get_admin_viewport_map_features')
}

export interface PublicImpactMetrics {
  definitionVersion: number
  generatedAt: string
  routesDocumented: number
  cragsMapped: number
  sendsLogged: number
  activeClimbers: number
  photos: number
  contributors: number
}

function isPublicImpactMetrics(value: unknown): value is PublicImpactMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.generatedAt === 'string'
    && ['definitionVersion', 'routesDocumented', 'cragsMapped', 'sendsLogged',
      'activeClimbers', 'photos', 'contributors']
      .every((key) => typeof record[key] === 'number')
}

export const getPublicImpactMetrics = cache(async (): Promise<PublicImpactMetrics | null> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_public_impact_metrics_v1')
  if (error || !isPublicImpactMetrics(data)) return null
  return data
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
