import { NextResponse } from 'next/server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { buildThumbnailUrl } from '@/lib/media/thumbnail-url'

const PAGE_SIZE = 48
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cragId = searchParams.get('cragId')
  const offset = Number(searchParams.get('offset') || 0)

  if (!cragId || !Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: 'Missing or invalid image navigation params' }, { status: 400 })
  }

  const { data, error } = await getUnauthenticatedClient()
    .from('images')
    .select('id, url, width, height, created_at, latitude, longitude')
    .eq('crag_id', cragId)
    .eq('status', 'approved')
    .eq('processing_status', 'ready')
    .in('moderation_status', ['approved', 'skipped'])
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: 'Failed to load image navigation' }, { status: 500 })

  return NextResponse.json(
    {
      images: (data || []).map((image) => ({
        ...image,
        src: buildThumbnailUrl(image.url, 1200),
      })),
      nextOffset: offset + (data?.length || 0),
      hasMore: (data?.length || 0) === PAGE_SIZE,
    },
    { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } }
  )
}
