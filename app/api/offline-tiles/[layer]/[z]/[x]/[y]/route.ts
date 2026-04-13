import { NextRequest, NextResponse } from 'next/server'

const TILE_LAYER_BASE_URLS = {
  imagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
  labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile',
} as const

function parseTileSegment(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> }
) {
  const { layer, z, x, y } = await params
  if (layer !== 'imagery' && layer !== 'labels') {
    return NextResponse.json({ error: 'Invalid tile layer' }, { status: 400 })
  }

  const zoom = parseTileSegment(z)
  const tileX = parseTileSegment(x)
  const rawY = y.endsWith('.png') ? y.slice(0, -4) : y
  const tileY = parseTileSegment(rawY)

  if (zoom === null || tileX === null || tileY === null) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 })
  }

  const tileResponse = await fetch(`${TILE_LAYER_BASE_URLS[layer]}/${zoom}/${tileY}/${tileX}`, {
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
