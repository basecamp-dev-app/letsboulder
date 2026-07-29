import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { loadCragPackManifest } from '@/features/offline/server/crag-pack-manifest'
import { reportError } from '@/lib/errors'

const paramsSchema = z.object({ cragId: z.string().uuid() })
const CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'

function matchesEtag(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false
  return ifNoneMatch.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, '')
    return normalized === '*' || normalized === etag
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cragId: string }> },
) {
  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid crag ID' }, { status: 400 })

  try {
    const manifest = await loadCragPackManifest(parsed.data.cragId)
    if (!manifest) return NextResponse.json({ error: 'Crag not found' }, { status: 404 })

    const etag = `"${manifest.contentVersion}"`
    const headers = { 'Cache-Control': CACHE_CONTROL, ETag: etag }
    if (matchesEtag(request.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, { status: 304, headers })
    }
    return NextResponse.json(manifest, { headers })
  } catch (error) {
    reportError(error, { message: 'Failed to build crag pack manifest', extra: { cragId: parsed.data.cragId } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
