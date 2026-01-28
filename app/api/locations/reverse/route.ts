import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 })
  }

  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)

  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const rateLimitResult = rateLimit(request, 'externalApi')
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  try {
    const response = await fetch(
      `${NOMINATIM_REVERSE_URL}?format=json&lat=${latNum}&lon=${lngNum}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'letsboulder-climbing-app',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Reverse geocoding request failed')
    }

    const data = await response.json()

    const result = {
      lat: latNum,
      lng: lngNum,
      name: data.name || data.display_name?.split(',')[0] || 'Unknown Location',
      display_name: data.display_name,
      address: {
        city: data.address?.city || data.address?.town || data.address?.village || '',
        state: data.address?.state || '',
        country: data.address?.country || '',
        country_code: data.address?.country_code || '',
      },
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Reverse geocoding error')
  }
}
