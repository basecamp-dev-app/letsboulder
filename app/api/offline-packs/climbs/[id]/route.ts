import { NextRequest, NextResponse } from 'next/server'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'

export const revalidate = 3600

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: climbId } = await params

  if (!climbId) {
    return NextResponse.json({ error: 'Climb ID is required' }, { status: 400 })
  }

  try {
    const payload = await buildClimbOfflinePack(climbId)
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load climb pack'
    const status = message === 'Climb not found' ? 404 : 500
    console.error('Offline climb pack route error:', error)
    return NextResponse.json({ error: status === 404 ? 'Climb not found' : 'Failed to load climb pack' }, { status })
  }
}
