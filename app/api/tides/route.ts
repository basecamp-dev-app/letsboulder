import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import {
  applyWindowBuffer,
  buildTidesCacheKey,
  computeRawAccessWindows,
  interpolateHeight,
  pickNextWindow,
  type TidePoint,
} from '@/lib/tides'
import { getUpstashRedis } from '@/lib/upstash'

interface WorldTidesHeight {
  dt: number
  height: number
}

interface WorldTidesResponse {
  status?: number
  error?: string
  heights?: WorldTidesHeight[]
  station?: string
  timezone?: string
  responseDatum?: string
  copyright?: string
}

const DEFAULT_FORECAST_HOURS = 72
const MIN_FORECAST_HOURS = 24
const MAX_FORECAST_HOURS = 168
const CACHE_TTL_SECONDS = 60 * 60 * 6

function parseForecastHours(rawHours: string | null): number {
  const parsed = rawHours ? Number.parseInt(rawHours, 10) : DEFAULT_FORECAST_HOURS
  if (!Number.isFinite(parsed)) return DEFAULT_FORECAST_HOURS
  return Math.min(MAX_FORECAST_HOURS, Math.max(MIN_FORECAST_HOURS, parsed))
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageId = searchParams.get('image_id')
  const forecastHours = parseForecastHours(searchParams.get('hours'))

  if (!imageId) {
    return NextResponse.json({ error: 'image_id is required' }, { status: 400 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return request.cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, latitude, longitude, is_tidal, tidal_max_height_m, tidal_buffer_min, tidal_notes')
      .eq('id', imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!image.is_tidal) {
      return NextResponse.json({ tidal: false })
    }

    if (image.latitude == null || image.longitude == null) {
      return NextResponse.json({ error: 'Tidal images must include GPS coordinates' }, { status: 400 })
    }

    if (image.tidal_max_height_m == null) {
      return NextResponse.json({ error: 'Tidal max height is missing for this image' }, { status: 400 })
    }

    const redis = getUpstashRedis()
    const cacheKey = buildTidesCacheKey(image.id)

    if (redis) {
      const cached = await redis.get<string>(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as Record<string, unknown>
          return NextResponse.json(parsed)
        } catch {
          await redis.del(cacheKey)
        }
      }
    }

    const worldTidesKey = process.env.WORLDTIDES_API_KEY
    if (!worldTidesKey) {
      return NextResponse.json({ error: 'WorldTides API key is not configured' }, { status: 500 })
    }

    const nowEpochSec = Math.floor(Date.now() / 1000)
    const startEpochSec = nowEpochSec - 60 * 60
    const lengthSec = forecastHours * 60 * 60 + 2 * 60 * 60

    const worldTidesUrl = new URL('https://www.worldtides.info/api/v3')
    worldTidesUrl.searchParams.set('heights', '')
    worldTidesUrl.searchParams.set('localtime', '')
    worldTidesUrl.searchParams.set('datum', 'CD')
    worldTidesUrl.searchParams.set('lat', String(image.latitude))
    worldTidesUrl.searchParams.set('lon', String(image.longitude))
    worldTidesUrl.searchParams.set('start', String(startEpochSec))
    worldTidesUrl.searchParams.set('length', String(lengthSec))
    worldTidesUrl.searchParams.set('step', '900')
    worldTidesUrl.searchParams.set('key', worldTidesKey)

    const worldTidesRes = await fetch(worldTidesUrl.toString(), { method: 'GET' })

    if (!worldTidesRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch tide data' }, { status: 502 })
    }

    const worldTidesJson = (await worldTidesRes.json()) as WorldTidesResponse

    if (worldTidesJson.status && worldTidesJson.status !== 200) {
      return NextResponse.json(
        { error: worldTidesJson.error || 'WorldTides request failed' },
        { status: 502 }
      )
    }

    const heights = Array.isArray(worldTidesJson.heights) ? worldTidesJson.heights : []
    const points: TidePoint[] = heights
      .map((point) => ({ dt: Number(point.dt), height: Number(point.height) }))
      .filter((point) => Number.isFinite(point.dt) && Number.isFinite(point.height))

    if (points.length < 2) {
      return NextResponse.json({ error: 'No usable tide data returned from WorldTides' }, { status: 502 })
    }

    const thresholdM = Number(image.tidal_max_height_m)
    const bufferMin = Math.max(0, Number(image.tidal_buffer_min || 0))
    const currentHeight = interpolateHeight(points, nowEpochSec)
    const rawWindows = computeRawAccessWindows(points, thresholdM)
    const bufferedWindows = applyWindowBuffer(rawWindows, bufferMin)
    const accessibleNow = bufferedWindows.some((window) => nowEpochSec >= window.start && nowEpochSec <= window.end)
    const nextWindow = pickNextWindow(bufferedWindows, nowEpochSec)

    const payload = {
      tidal: true,
      imageId: image.id,
      thresholdM,
      bufferMin,
      currentHeightM: currentHeight,
      accessibleNow,
      nextWindow: nextWindow
        ? {
            start: new Date(nextWindow.start * 1000).toISOString(),
            end: new Date(nextWindow.end * 1000).toISOString(),
          }
        : null,
      station: worldTidesJson.station || null,
      timezone: worldTidesJson.timezone || null,
      datum: worldTidesJson.responseDatum || null,
      notes: image.tidal_notes || null,
      copyright: worldTidesJson.copyright || null,
      generatedAt: new Date().toISOString(),
    }

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(payload), { ex: CACHE_TTL_SECONDS })
    }

    return NextResponse.json(payload)
  } catch (error) {
    return createErrorResponse(error, 'Error generating tidal forecast')
  }
}
