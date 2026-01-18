import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  const rateLimitResult = rateLimit(request, 'externalApi')
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim())
    const response = await fetch(
      `${NOMINATIM_URL}?format=json&limit=10&addressdetails=1&extratags=1&q=${encodedQuery}`,
      {
        headers: {
          'User-Agent': 'gsyrocks-climbing-app',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Geocoding request failed')
    }

    const data = await response.json()

    interface NominatimApiItem {
      lat: string
      lon: string
      display_name: string
      type: string
      address: {
        city?: string
        town?: string
        village?: string
        state?: string
        country: string
        country_code: string
      }
    }

    const results = data.map((item: NominatimApiItem) => ({
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      name: item.display_name.split(',')[0],
      display_name: item.display_name,
      type: item.type,
      address: {
        city: item.address?.city || item.address?.town || item.address?.village || '',
        state: item.address?.state || '',
        country: item.address?.country || '',
        country_code: item.address?.country_code || '',
      },
    }))

    return NextResponse.json({ results }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Location search error')
  }
}
