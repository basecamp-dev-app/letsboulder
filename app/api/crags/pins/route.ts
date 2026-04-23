import { NextResponse } from 'next/server'
import { fetchMapPinsWithClient, getUnauthenticatedClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { serverEnv } from '@/lib/env.server'

export const revalidate = 60

export async function GET() {
  const includePending = serverEnv.NEXT_PUBLIC_ALLOW_PENDING_IMAGES

  const supabase = getUnauthenticatedClient()

  try {
    const pins = await fetchMapPinsWithClient(supabase, includePending)

    return NextResponse.json({ pins }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching crag pins' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
