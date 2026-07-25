import { NextResponse } from 'next/server'
import { loadRoutePageCommunityNotes } from '@/features/image-first/server/load-route-page-community-notes'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const effectiveClimbId = searchParams.get('effectiveClimbId')

  if (!effectiveClimbId) {
    return NextResponse.json({ error: 'Missing effectiveClimbId' }, { status: 400 })
  }

  try {
    const notes = await loadRoutePageCommunityNotes(effectiveClimbId)
    return NextResponse.json({ notes })
  } catch {
    return NextResponse.json({ error: 'Failed to load community notes' }, { status: 500 })
  }
}
