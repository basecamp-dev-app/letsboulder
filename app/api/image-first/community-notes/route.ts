import { NextResponse } from 'next/server'
import { loadRoutePageCommunityNotes } from '@/features/image-first/server/load-route-page-community-notes'

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const effectiveClimbId = searchParams.get('effectiveClimbId')

  if (!effectiveClimbId) {
    return NextResponse.json({ error: 'Missing effectiveClimbId' }, { status: 400 })
  }

  try {
    const notes = await loadRoutePageCommunityNotes(effectiveClimbId)
    return NextResponse.json({ notes }, {
      headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load community notes' }, { status: 500 })
  }
}
