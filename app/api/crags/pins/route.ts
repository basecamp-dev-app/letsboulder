import { NextRequest, NextResponse } from 'next/server'
import {
  fetchViewportMapFeaturesWithClient,
  getUnauthenticatedClient,
} from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { createRateLimitResponse, rateLimit } from '@/lib/rate-limit'
import { parseViewportSearchParams } from '@/lib/map/viewport-params'

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'

export async function GET(request: NextRequest) {
  const viewport = parseViewportSearchParams(request.nextUrl.searchParams)

  if (!viewport) {
    return NextResponse.json({ error: 'north, south, east, west, and integer zoom (0-22) must form valid bounds' }, { status: 400 })
  }

  const rateLimitResult = await rateLimit(request, 'publicSearch')
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult)

  try {
    const pins = await fetchViewportMapFeaturesWithClient(getUnauthenticatedClient(), viewport)

    return NextResponse.json({ pins }, {
      headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL },
    })
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching crag pins' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
