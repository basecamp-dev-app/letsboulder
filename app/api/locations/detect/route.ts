import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'

const detectLocationSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
}).superRefine((value, ctx) => {
  if (!Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latitude'],
      message: 'Valid latitude and longitude are required',
    })
  }

  if (!Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['longitude'],
      message: 'Valid latitude and longitude are required',
    })
  }
})

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (rawBody.length > 2 * 1024) {
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      )
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const parsedBody = parseWithSchema(detectLocationSchema, body)
    if (!parsedBody.success) return parsedBody.response

    const { latitude, longitude } = parsedBody.data

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
