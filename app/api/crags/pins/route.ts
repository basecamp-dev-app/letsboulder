import { NextRequest, NextResponse } from 'next/server'
import { fetchViewportMapFeaturesWithClient, getServerClientFromRequest, getViewportMapClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { serverEnv } from '@/lib/env.server'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'

export const revalidate = 60

const VIEWPORT_PARAMS = ['north', 'south', 'east', 'west', 'zoom'] as const

function parseViewport(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if ([...params.keys()].some((name) => !VIEWPORT_PARAMS.includes(name as typeof VIEWPORT_PARAMS[number]))) return undefined
  const suppliedCount = VIEWPORT_PARAMS.filter((name) => params.has(name)).length
  if (suppliedCount !== VIEWPORT_PARAMS.length
    || VIEWPORT_PARAMS.some((name) => params.getAll(name).length !== 1)) return undefined

  const rawValues = VIEWPORT_PARAMS.map((name) => params.get(name) ?? '')
  if (rawValues.some((value) => value.trim().length === 0)) return undefined
  const [north, south, east, west, zoom] = rawValues.map(Number)
  const longitudeSpan = west < east ? east - west : 360 - west + east
  const maximumHighZoomSpan = 10 / (2 ** Math.max(0, zoom - 12))
  if ([north, south, east, west, zoom].some((value) => !Number.isFinite(value))
    || north < -90 || north > 90 || south < -90 || south > 90
    || east < -180 || east > 180 || west < -180 || west > 180
    || north <= south || east === west
    || !Number.isInteger(zoom) || zoom < 0 || zoom > 22
    || (zoom >= 12 && (north - south > maximumHighZoomSpan || longitudeSpan > maximumHighZoomSpan))) return undefined

  return { north, south, east, west, zoom }
}

export async function GET(request: NextRequest) {
  const viewport = parseViewport(request)

  if (viewport === undefined) {
    return NextResponse.json({ error: 'north, south, east, west, and integer zoom (0-22) must form valid bounds' }, { status: 400 })
  }

  let includePending = false
  if (serverEnv.NEXT_PUBLIC_ALLOW_PENDING_IMAGES) {
    const requestSupabase = getServerClientFromRequest(request)
    const { data: user, error: authError } = await requestSupabase.auth.getUser()
    if (!authError && user.user) {
      const { data: isAdmin, error: adminError } = await isCurrentUserAdmin(requestSupabase)
      includePending = !adminError && isAdmin === true
    }
  }

  const supabase = getViewportMapClient()

  try {
    const pins = await fetchViewportMapFeaturesWithClient(supabase, viewport, includePending)

    return NextResponse.json({ pins }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching crag pins' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
