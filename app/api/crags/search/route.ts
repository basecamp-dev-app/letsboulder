import { NextRequest, NextResponse } from 'next/server'
import { searchCrags } from '@/features/crags/server/search-crags'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'

export const revalidate = 30

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase() || ''
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

  if (!query || query.length < 2) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  }

  const hasLocation = latParam !== null && lngParam !== null
  const latitude = hasLocation ? parseFloat(latParam) : null
  const longitude = hasLocation ? parseFloat(lngParam) : null

  try {
    const supabase = getUnauthenticatedClient()
    const { rows, error } = await searchCrags({ supabase, query, latitude, longitude })

    if (error) {
      return createErrorResponse(error, 'Supabase error')
    }

    return NextResponse.json(rows, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Error searching crags')
  }
}
