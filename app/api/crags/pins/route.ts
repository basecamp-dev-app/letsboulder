import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
  const includePending = process.env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES === 'true'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )

  try {
    let cragPinRows: unknown[] | null = null

    const { data: withArgRows, error: withArgError } = await supabase.rpc('get_crag_pins', {
      include_pending: includePending,
    })

    if (withArgError) {
      const isMissingFunctionSignature = withArgError.code === 'PGRST202'
      if (!isMissingFunctionSignature) {
        console.error('Error fetching crag pins:', withArgError)
        return NextResponse.json({ error: 'Failed to fetch crag pins' }, { status: 500 })
      }

      console.warn('get_crag_pins(include_pending) not available, falling back to get_crag_pins()')

      const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_crag_pins')
      if (fallbackError) {
        console.error('Error fetching crag pins:', fallbackError)
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
        console.error('Error fetching crag pin metadata:', cragMetaError)
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
      console.error('Error fetching gym pins:', gymError)
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
    console.error('Unexpected error fetching crag pins:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
