import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import exifr from 'exifr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ALLOWED_BUCKETS = new Set(['route-uploads'])

interface ExifGpsData {
  latitude?: number
  longitude?: number
  altitude?: number
}

interface ExtractGpsRequestBody {
  bucket: string
  path: string
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return createErrorResponse(new Error('Missing SUPABASE_SERVICE_ROLE_KEY'), 'GPS extraction config error')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  try {
    const body = (await request.json()) as Partial<ExtractGpsRequestBody>
    const bucket = body.bucket?.trim()
    const path = body.path?.trim()

    if (!bucket || !path) {
      return NextResponse.json({ error: 'bucket and path are required' }, { status: 400 })
    }

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: 'Unsupported bucket' }, { status: 400 })
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path)

    if (downloadError || !file) {
      return NextResponse.json({ error: 'Failed to fetch image from storage' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const exifPromise = exifr.parse(buffer, { tiff: true, exif: true, gps: true })
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('EXIF parsing timeout')), 25000)
    )

    const exifData = await Promise.race<ExifGpsData | undefined>([exifPromise, timeoutPromise])

    const hasGps =
      typeof exifData?.latitude === 'number' &&
      Number.isFinite(exifData.latitude) &&
      typeof exifData?.longitude === 'number' &&
      Number.isFinite(exifData.longitude)

    if (!hasGps) {
      // If no GPS data is found, return null coordinates instead of an error
      return NextResponse.json({
        latitude: null,
        longitude: null,
        altitude: null
      })
    }

    return NextResponse.json({
      latitude: exifData.latitude,
      longitude: exifData.longitude,
      altitude: exifData.altitude
    })
  } catch (error) {
    return createErrorResponse(error, 'GPS extraction error')
  }
}
