import { NextRequest, NextResponse } from 'next/server'
import exifr from 'exifr'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check file size server-side (additional safety)
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      return NextResponse.json({
        error: 'Image file is too large. Please compress or choose a smaller image (max 5MB).'
      }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Add timeout to EXIF parsing to prevent server hangs
    const exifPromise = exifr.parse(buffer)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('EXIF parsing timeout')), 25000)
    )

    const exifData = await Promise.race([exifPromise, timeoutPromise]) as any

    if (!exifData?.latitude || !exifData?.longitude) {
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
    console.error('GPS extraction error:', error)
    return NextResponse.json({ error: 'Failed to extract GPS data' }, { status: 500 })
  }
}