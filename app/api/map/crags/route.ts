import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { createErrorResponse } from '@/lib/errors'

export const revalidate = 30

function parseNumber(value: string | null): number | null {
  if (!value) return null
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return null
  return n
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function normalizeLng(lng: number): number {
  // Normalize to [-180, 180]
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180
  return wrapped
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const west = parseNumber(searchParams.get('west'))
  const south = parseNumber(searchParams.get('south'))
  const east = parseNumber(searchParams.get('east'))
  const north = parseNumber(searchParams.get('north'))
  const zoomRaw = parseNumber(searchParams.get('zoom'))

  if (west == null || south == null || east == null || north == null || zoomRaw == null) {
    return NextResponse.json([], { status: 200 })
  }

  const minLat = clamp(Math.min(south, north), -90, 90)
  const maxLat = clamp(Math.max(south, north), -90, 90)
  const rawSpan = Math.abs(east - west)

  let minLng = normalizeLng(west)
  let maxLng = normalizeLng(east)

  // If the viewport spans the whole world (or more), treat as world coverage.
  if (rawSpan >= 360) {
    minLng = -180
    maxLng = 180
  }
  const zoom = Math.round(clamp(zoomRaw, 0, 19))

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  try {
    const { data, error } = await supabase.rpc('get_map_crag_points', {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
      zoom,
    })

    if (error) {
      return createErrorResponse(error, 'Error fetching map crags')
    }

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Map crags API error')
  }
}
