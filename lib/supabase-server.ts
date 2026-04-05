import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'
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

export function getAdminClient() {
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    serverEnv.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      cookies: {
        getAll() { return [] },
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

interface CragPinRow {
  id: string
  name: string
  latitude: number
  longitude: number
  image_count: number
}

interface CragMetaRow {
  id: string
  slug: string | null
  country_code: string | null
  route_count: number | null
}

interface GymPinRow {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  slug: string | null
  country_code: string | null
}

export const fetchMapPins = cache(async (): Promise<PlacePin[]> => {
  const includePending = env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES
  const supabase = await getServerClient()

  try {
    let cragPinRows: unknown[] | null = null

    const { data: withArgRows, error: withArgError } = await supabase.rpc('get_crag_pins', {
      include_pending: includePending,
    })

    if (withArgError) {
      const isMissingFunctionSignature = withArgError.code === 'PGRST202'
      if (!isMissingFunctionSignature) {
        reportError(withArgError, { message: 'Error fetching crag pins' })
        return []
      }

      const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_crag_pins')
      if (fallbackError) {
        reportError(fallbackError, { message: 'Error fetching crag pins' })
        return []
      }

      cragPinRows = fallbackRows as unknown[]
    } else {
      cragPinRows = withArgRows as unknown[]
    }

    const typedCragPinRows = (cragPinRows || []) as CragPinRow[]
    const cragIds = typedCragPinRows.map((row) => row.id)

    const cragMetaById = new Map<string, CragMetaRow>()
    if (cragIds.length > 0) {
      const { data: cragMetaRows, error: cragMetaError } = await supabase
        .from('crags')
        .select('id, slug, country_code, route_count')
        .in('id', cragIds)

      if (cragMetaError) {
        reportError(cragMetaError, { message: 'Error fetching crag pin metadata' })
        return []
      }

      for (const row of (cragMetaRows || []) as CragMetaRow[]) {
        cragMetaById.set(row.id, row)
      }
    }

    const { data: gymPinRows, error: gymError } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, slug, country_code')
      .eq('type', 'gym')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .not('slug', 'is', null)

    if (gymError) {
      reportError(gymError, { message: 'Error fetching gym pins' })
      return []
    }

    const cragPins: PlacePin[] = typedCragPinRows.map((row) => {
      const meta = cragMetaById.get(row.id)
      return {
        id: row.id,
        name: row.name,
        type: 'crag',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        slug: meta?.slug || null,
        country_code: meta?.country_code || null,
        image_count: Number(row.image_count) || 0,
        route_count: meta?.route_count ?? null,
      }
    })

    const gymPins: PlacePin[] = ((gymPinRows || []) as GymPinRow[])
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: 'gym',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        slug: row.slug,
        country_code: row.country_code,
        image_count: null,
        route_count: null,
      }))

    return [...cragPins, ...gymPins]
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching crag pins' })
    return []
  }
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
