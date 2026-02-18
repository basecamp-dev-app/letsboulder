import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { buildTidesCacheKey } from '@/lib/tides'
import { getUpstashRedis } from '@/lib/upstash'

interface UpdateImageTidalRequest {
  is_tidal?: boolean
  tidal_max_height_m?: number | null
  tidal_buffer_min?: number
  tidal_notes?: string | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: imageId } = await params

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = (await request.json()) as UpdateImageTidalRequest

    const { data: existingImage, error: imageError } = await supabase
      .from('images')
      .select('id, latitude, longitude, is_tidal, tidal_max_height_m, tidal_buffer_min, tidal_notes')
      .eq('id', imageId)
      .single()

    if (imageError || !existingImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const nextIsTidal = body.is_tidal ?? existingImage.is_tidal
    const nextMaxHeight = body.tidal_max_height_m !== undefined
      ? body.tidal_max_height_m
      : existingImage.tidal_max_height_m
    const nextBufferMin = body.tidal_buffer_min !== undefined
      ? body.tidal_buffer_min
      : existingImage.tidal_buffer_min
    const nextNotes = body.tidal_notes !== undefined
      ? body.tidal_notes
      : existingImage.tidal_notes

    if (body.tidal_max_height_m !== undefined && body.tidal_max_height_m !== null && !isFiniteNumber(body.tidal_max_height_m)) {
      return NextResponse.json({ error: 'tidal_max_height_m must be a valid number in meters' }, { status: 400 })
    }

    if (body.tidal_buffer_min !== undefined && (!Number.isInteger(body.tidal_buffer_min) || body.tidal_buffer_min < 0)) {
      return NextResponse.json({ error: 'tidal_buffer_min must be a non-negative integer' }, { status: 400 })
    }

    if (nextIsTidal) {
      if (existingImage.latitude == null || existingImage.longitude == null) {
        return NextResponse.json({ error: 'Cannot enable tidal access for images without GPS coordinates' }, { status: 400 })
      }

      if (nextMaxHeight === null || nextMaxHeight === undefined || !isFiniteNumber(Number(nextMaxHeight))) {
        return NextResponse.json({ error: 'tidal_max_height_m is required when is_tidal is true' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {
      is_tidal: nextIsTidal,
      tidal_buffer_min: nextBufferMin,
      tidal_notes: nextNotes,
      tidal_max_height_m: nextIsTidal ? nextMaxHeight : null,
    }

    const { data: updatedImage, error: updateError } = await supabase
      .from('images')
      .update(updateData)
      .eq('id', imageId)
      .select('id, is_tidal, tidal_max_height_m, tidal_buffer_min, tidal_notes')
      .single()

    if (updateError) {
      return createErrorResponse(updateError, 'Error updating image tidal settings')
    }

    const redis = getUpstashRedis()
    if (redis) {
      await redis.del(buildTidesCacheKey(imageId))
    }

    return NextResponse.json({ success: true, image: updatedImage })
  } catch (error) {
    return createErrorResponse(error, 'Error updating image tidal settings')
  }
}
