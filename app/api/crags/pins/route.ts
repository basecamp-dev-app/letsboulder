import { NextResponse } from 'next/server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { serverEnv } from '@/lib/env'

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

interface PlacePin {
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

export async function GET() {
  const includePending = serverEnv.NEXT_PUBLIC_ALLOW_PENDING_IMAGES

  const supabase = getUnauthenticatedClient()

  try {
    let cragPinRows: unknown[] | null = null

    const { data: withArgRows, error: withArgError } = await supabase.rpc('get_crag_pins', {
      include_pending: includePending,
    })

    if (withArgError) {
      const isMissingFunctionSignature = withArgError.code === 'PGRST202'
      if (!isMissingFunctionSignature) {
        reportError(withArgError, { message: 'Error fetching crag pins' })
        return NextResponse.json({ error: 'Failed to fetch crag pins' }, { status: 500 })
      }

      console.warn('get_crag_pins(include_pending) not available, falling back to get_crag_pins()')

      const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_crag_pins')
      if (fallbackError) {
        reportError(fallbackError, { message: 'Error fetching crag pins' })
        return NextResponse.json({ error: 'Failed to fetch crag pins' }, { status: 500 })
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
        return NextResponse.json({ error: 'Failed to fetch crag pin metadata' }, { status: 500 })
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
      return NextResponse.json({ error: 'Failed to fetch gym pins' }, { status: 500 })
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

    return NextResponse.json({ pins: [...cragPins, ...gymPins] })
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching crag pins' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
