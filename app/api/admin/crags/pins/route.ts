import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/features/admin/server'
import { fetchAdminViewportMapFeaturesWithClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { parseViewportSearchParams } from '@/lib/map/viewport-params'

export async function GET(request: NextRequest) {
  const viewport = parseViewportSearchParams(request.nextUrl.searchParams)
  if (!viewport) {
    return NextResponse.json({ error: 'north, south, east, west, and integer zoom (0-22) must form valid bounds' }, { status: 400 })
  }

  const admin = await requireAdmin(request)
  if (admin.error) return admin.error
  if (!admin.context) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const pins = await fetchAdminViewportMapFeaturesWithClient(admin.context.supabase, viewport)
    return NextResponse.json({ pins }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    reportError(error, { message: 'Unexpected error fetching admin crag pins' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
