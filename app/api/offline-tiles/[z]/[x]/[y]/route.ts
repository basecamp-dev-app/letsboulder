import { NextRequest, NextResponse } from 'next/server'

const ESRI_TILE_BASE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

function parseTileSegment(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params
  const zoom = parseTileSegment(z)
  const tileX = parseTileSegment(x)
  const rawY = y.endsWith('.png') ? y.slice(0, -4) : y
  const tileY = parseTileSegment(rawY)

  if (zoom === null || tileX === null || tileY === null) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 })
  }

  const tileResponse = await fetch(`${ESRI_TILE_BASE_URL}/${zoom}/${tileY}/${tileX}`, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  })

  if (!tileResponse.ok) {
    return new NextResponse('Tile unavailable', { status: tileResponse.status })
  }

  const buffer = await tileResponse.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': tileResponse.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=2592000, immutable',
    },
  })
}
