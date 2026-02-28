import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (rawBody.length > 2 * 1024) {
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      )
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const rawLatitude = body?.latitude
    const rawLongitude = body?.longitude

    const latitude =
      typeof rawLatitude === 'number'
        ? rawLatitude
        : typeof rawLatitude === 'string' && rawLatitude.trim().length > 0
          ? Number(rawLatitude)
          : Number.NaN

    const longitude =
      typeof rawLongitude === 'number'
        ? rawLongitude
        : typeof rawLongitude === 'string' && rawLongitude.trim().length > 0
          ? Number(rawLongitude)
          : Number.NaN

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      )
    }

    const rateLimitResult = rateLimit(request, 'geoDetect')
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    // Use Nominatim for reverse geocoding (free, no API key required)
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`

    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'letsboulder-climbing-app (contact@letsboulder.com)'
      }
    })

    if (!response.ok) {
      throw new Error('Geocoding service failed')
    }

    const data = await response.json()

    const result = {
      latitude,
      longitude,
      country: data.address?.country || '',
      countryCode: (data.address?.country_code || '').toUpperCase(),
      region: data.address?.county || data.address?.region || data.address?.state || '',
      town: data.address?.town || data.address?.city || data.address?.village || data.address?.municipality || '',
      displayName: data.display_name || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    return createErrorResponse(error, 'Geocoding error')
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Location detection endpoint',
    method: 'POST',
    required_fields: ['latitude', 'longitude'],
    provider: 'OpenStreetMap Nominatim'
  })
}
