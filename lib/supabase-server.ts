import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { serverEnv } from '@/lib/env'

export async function getServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
  const includePending = serverEnv.NEXT_PUBLIC_ALLOW_PENDING_IMAGES
  const supabase = await getServerClient()

  try {
    let cragPinRows: unknown[] | null = null

    const { data: withArgRows, error: withArgError } = await supabase.rpc('get_crag_pins', {
      include_pending: includePending,
    })

    if (withArgError) {
      const isMissingFunctionSignature = withArgError.code === 'PGRST202'
      if (!isMissingFunctionSignature) {
        console.error('Error fetching crag pins:', withArgError)
        return []
      }

      const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_crag_pins')
      if (fallbackError) {
        console.error('Error fetching crag pins:', fallbackError)
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
        console.error('Error fetching crag pin metadata:', cragMetaError)
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
      console.error('Error fetching gym pins:', gymError)
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
    console.error('Unexpected error fetching crag pins:', error)
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
