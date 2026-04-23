import { NextResponse } from 'next/server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

interface ImagePinRow {
  id: string
  latitude: number | null
  longitude: number | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cragId = searchParams.get('cragId')
  const north = Number(searchParams.get('north'))
  const south = Number(searchParams.get('south'))
  const east = Number(searchParams.get('east'))
  const west = Number(searchParams.get('west'))

  if (!cragId || [north, south, east, west].some((value) => Number.isNaN(value))) {
    return NextResponse.json({ error: 'Missing or invalid bounds params' }, { status: 400 })
  }

  const supabase = getUnauthenticatedClient()
  const query = supabase
    .from('images')
    .select('id, latitude, longitude')
    .eq('crag_id', cragId)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .lte('latitude', north)
    .gte('latitude', south)

  const boundedQuery = west <= east
    ? query.lte('longitude', east).gte('longitude', west)
    : query.or(`longitude.gte.${west},longitude.lte.${east}`)

  const { data, error } = await boundedQuery

  if (error) {
    return NextResponse.json({ error: 'Failed to load image pins' }, { status: 500 })
  }

  const pins = ((data || []) as ImagePinRow[])
    .filter((row) => typeof row.latitude === 'number' && typeof row.longitude === 'number')
    .map((row) => ({
      imageId: row.id,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      activeImageIds: [row.id],
      primaryImageId: row.id,
    }))

  return NextResponse.json({ pins })
}
