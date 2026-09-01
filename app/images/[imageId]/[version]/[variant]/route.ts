import { NextResponse } from 'next/server'

import {
  isPhaseOneFixtureImage,
  PHASE_ONE_FIXTURE_WEBP_BASE64,
} from '@/features/offline/server/phase-one-offline-fixture'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string; version: string; variant: string }> },
) {
  const { imageId, version, variant } = await params
  if (!isPhaseOneFixtureImage(imageId, version, variant)) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  return new NextResponse(Buffer.from(PHASE_ONE_FIXTURE_WEBP_BASE64, 'base64'), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/webp',
      'Content-Length': '46',
    },
  })
}
