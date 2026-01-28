import { NextRequest, NextResponse } from 'next/server'

function parseBbox(bboxParam: string | null): [number, number, number, number] | null {
  if (!bboxParam) return null
  const parts = bboxParam.split(',').map((x) => Number(x.trim()))
  if (parts.length !== 4) return null
  const [minLon, minLat, maxLon, maxLat] = parts
  if ([minLon, minLat, maxLon, maxLat].some((n) => !Number.isFinite(n))) return null
  if (minLon >= maxLon || minLat >= maxLat) return null
  return [minLon, minLat, maxLon, maxLat]
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)

  const bbox = parseBbox(url.searchParams.get('bbox'))
  if (!bbox) {
    return NextResponse.json({ error: 'Invalid bbox' }, { status: 400 })
  }

  const width = clampInt(Number(url.searchParams.get('w') || 1200), 256, 2048)
  const height = clampInt(Number(url.searchParams.get('h') || 700), 256, 2048)

  const [minLon, minLat, maxLon, maxLat] = bbox
  const esriUrl = new URL(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
  )
  esriUrl.searchParams.set('bbox', `${minLon},${minLat},${maxLon},${maxLat}`)
  esriUrl.searchParams.set('bboxSR', '4326')
  esriUrl.searchParams.set('imageSR', '3857')
  esriUrl.searchParams.set('size', `${width},${height}`)
  esriUrl.searchParams.set('format', 'png')
  esriUrl.searchParams.set('transparent', 'false')
  esriUrl.searchParams.set('f', 'image')

  try {
    const res = await fetch(esriUrl.toString(), {
      headers: {
        'User-Agent': 'letsboulder-static-map',
      },
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch basemap' },
        { status: res.status >= 400 && res.status < 600 ? 502 : 500 }
      )
    }

    const bytes = await res.arrayBuffer()
    const out = new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
    return out
  } catch (error) {
    console.error('Static map error:', error)
    return NextResponse.json({ error: 'Failed to fetch basemap' }, { status: 502 })
  }
}
